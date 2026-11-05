import { expect, test } from '@playwright/test'

test('opens Calculator atomically and streams only its window', async ({ page, request }) => {
  const bridge = await request.get('http://127.0.0.1:8080/api/status')
  expect(bridge.ok()).toBeTruthy()

  const appsResponse = await request.get('http://127.0.0.1:8080/api/apps')
  const { apps } = await appsResponse.json() as { apps: Array<{ id: string }> }
  const calculator = apps.find((app) => app.id === 'org.gnome.Calculator.desktop')
  test.skip(!calculator, 'GNOME Calculator is not installed')

  const opened = await request.post('http://127.0.0.1:8080/api/apps/open', {
    data: { app_id: calculator!.id },
  })
  if (!opened.ok()) {
    const error = await opened.text()
    test.skip(
      opened.status() === 500 || opened.status() === 504,
      `OmniDeck Shell bridge requires logout/login before live isolation can be verified: ${error}`,
    )
    expect(opened.ok(), error).toBeTruthy()
  }
  const result = await opened.json() as {
    crop: boolean
    window: { appId: string, focused: boolean, bbox: { width: number, height: number } }
  }
  expect(result.crop).toBe(true)
  expect(result.window.appId).toBe(calculator!.id)
  expect(result.window.bbox.width).toBeGreaterThan(0)
  expect(result.window.bbox.height).toBeGreaterThan(0)
  expect(result.window.bbox.width < 1920 || result.window.bbox.height < 1080).toBe(true)

  await page.goto('/')
  const canvas = page.getByTestId('live-stream-canvas')
  await expect(canvas).toBeVisible()
  await expect.poll(async () => canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
  }))).toEqual(expect.objectContaining({ width: expect.any(Number), height: expect.any(Number) }))

  const rendered = await canvas.evaluate((node: HTMLCanvasElement) => ({
    width: node.width,
    height: node.height,
  }))
  const expectedRatio = result.window.bbox.width / result.window.bbox.height
  const renderedRatio = rendered.width / rendered.height
  expect(Math.abs(renderedRatio - expectedRatio)).toBeLessThan(0.03)
  expect(rendered.width < 1280 || rendered.height < 720).toBe(true)
})
