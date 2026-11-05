import { expect, test } from '@playwright/test'

test('draws a real JPEG from the running host and never shows demo code', async ({ page }) => {
  const binaryFrames: number[] = []
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') binaryFrames.push(payload.byteLength)
    })
  })

  await page.goto('/')
  await expect(page.getByText('pipeline_render.rs')).toHaveCount(0)

  const canvas = page.getByTestId('live-stream-canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(() => binaryFrames.length).toBeGreaterThan(0)
  await expect.poll(() => binaryFrames[0] ?? 0).toBeGreaterThan(1000)

  const rendered = await canvas.evaluate((node: HTMLCanvasElement) => {
    const context = node.getContext('2d')
    if (!context || node.width === 0 || node.height === 0) return null
    const points = [
      [0, 0],
      [Math.floor(node.width / 2), Math.floor(node.height / 2)],
      [node.width - 1, node.height - 1],
    ]
    return {
      width: node.width,
      height: node.height,
      alpha: points.map(([x, y]) => context.getImageData(x, y, 1, 1).data[3]),
    }
  })

  expect(rendered).not.toBeNull()
  expect(rendered?.width).toBeGreaterThan(0)
  expect(rendered?.height).toBeGreaterThan(0)
  expect(rendered?.alpha.every((value) => value === 255)).toBe(true)
  await expect(page.getByText('pipeline_render.rs')).toHaveCount(0)

  // Disconnect button test
  await page.getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByTestId('live-stream-canvas')).toHaveCount(0)
  await expect(page.getByRole('status')).toContainText('Host stream disconnected')
  await expect(page.getByText('pipeline_render.rs')).toHaveCount(0)

  // Reconnect button test
  await page.getByRole('button', { name: 'Reconnect' }).click()
  await expect(page.getByTestId('live-stream-canvas')).toBeVisible()
  await expect(page.getByText('pipeline_render.rs')).toHaveCount(0)
})
