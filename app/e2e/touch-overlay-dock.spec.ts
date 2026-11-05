import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 926, height: 428 }, hasTouch: true })

test('touch pointer, retractable overlays, and dock carousel stay synchronized', async ({ page }) => {
  const sentCommands: Array<{ type: string; payload: Record<string, unknown> }> = []

  page.on('websocket', (ws) => {
    ws.on('framesent', (event) => {
      try {
        if (typeof event.payload === 'string') {
          const parsed = JSON.parse(event.payload)
          const command = parsed?.type === 'input' ? parsed.data : parsed
          if (command && typeof command.type === 'string') {
            sentCommands.push(command)
          }
        }
      } catch {
        // ignore non-json frames
      }
    })
  })

  await page.route('http://127.0.0.1:8080/api/apps', async (route) => {
    const apps = Array.from({ length: 64 }, (_, index) => ({ id: `app-${index}.desktop`, name: `App ${index}` }))
    await route.fulfill({ json: { apps } })
  })

  await page.goto('/')
  const stream = page.locator('[data-ui]')
  await expect(stream).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const canvas = document.querySelector('canvas')
    return Boolean(canvas && canvas.width > 0 && canvas.height > 0)
  })).toBe(true)

  // 1. Tap the center of the actual object-contain stream image
  const content = await stream.evaluate((node) => {
    const media = node.querySelector('canvas, video, img') as HTMLCanvasElement | null
    const rect = node.getBoundingClientRect()
    const sw = media?.width ?? rect.width
    const sh = media?.height ?? rect.height
    const scale = Math.min(rect.width / sw, rect.height / sh)
    const width = sw * scale
    const height = sh * scale
    return {
      left: rect.left + (rect.width - width) / 2,
      top: rect.top + (rect.height - height) / 2,
      width,
      height,
    }
  })
  const touchX = content.left + content.width * 0.5
  const touchY = content.top + content.height * 0.5

  sentCommands.length = 0
  await page.touchscreen.tap(touchX, touchY)
  await expect.poll(() => sentCommands.filter((c) => c.type === 'mouse-click' && c.payload.button === 0).length).toBe(2)

  const pointer = page.getByTestId('hardware-cursor')
  await expect(pointer).toBeVisible()
  const pointerBox = await pointer.boundingBox()
  expect(Math.abs((pointerBox?.x ?? 0) + (pointerBox?.width ?? 0) / 2 - touchX)).toBeLessThan(2)
  expect(Math.abs((pointerBox?.y ?? 0) + (pointerBox?.height ?? 0) / 2 - touchY)).toBeLessThan(2)

  // Exactly one click and the same normalized point used by pointer and host
  const leftClicks = sentCommands.filter((c) => c.type === 'mouse-click' && c.payload.button === 0)
  expect(leftClicks).toHaveLength(2)
  expect(leftClicks[0].payload).toMatchObject({ pressed: true, clickCount: 1 })
  expect(leftClicks[1].payload).toMatchObject({ pressed: false, clickCount: 1 })
  expect(Math.abs(Number(leftClicks[0].payload.normalizedX) - 0.5)).toBeLessThan(0.01)
  expect(Math.abs(Number(leftClicks[0].payload.normalizedY) - 0.5)).toBeLessThan(0.01)

  // 2. Stationary two-finger tap emits right-click
  sentCommands.length = 0
  await stream.dispatchEvent('touchstart', {
    touches: [
      { identifier: 1, clientX: touchX - 20, clientY: touchY },
      { identifier: 2, clientX: touchX + 20, clientY: touchY },
    ],
  })
  await stream.dispatchEvent('touchend', { touches: [] })

  const rightClicks = sentCommands.filter((c) => c.type === 'mouse-click' && c.payload.button === 2)
  expect(rightClicks).toHaveLength(2)
  expect(rightClicks[0].payload).toMatchObject({ pressed: true, clickCount: 1 })
  expect(rightClicks[1].payload).toMatchObject({ pressed: false, clickCount: 1 })

  // 3. Two-finger drag scrolls without moving pointer or clicking
  sentCommands.length = 0
  await stream.dispatchEvent('touchstart', {
    touches: [
      { identifier: 1, clientX: 200, clientY: 200 },
      { identifier: 2, clientX: 240, clientY: 200 },
    ],
  })
  await stream.dispatchEvent('touchmove', {
    touches: [
      { identifier: 1, clientX: 200, clientY: 250 },
      { identifier: 2, clientX: 240, clientY: 250 },
    ],
  })
  await stream.dispatchEvent('touchend', { touches: [] })

  const scrolls = sentCommands.filter((c) => c.type === 'mouse-scroll')
  const movesDuringScroll = sentCommands.filter((c) => c.type === 'mouse-move')
  const clicksDuringScroll = sentCommands.filter((c) => c.type === 'mouse-click')
  expect(scrolls.length).toBeGreaterThanOrEqual(1)
  expect(movesDuringScroll).toHaveLength(0)
  expect(clicksDuringScroll).toHaveLength(0)

  // 4. Three-finger tap toggles overlays without host input
  sentCommands.length = 0
  await stream.dispatchEvent('touchstart', {
    touches: [
      { identifier: 1, clientX: 100, clientY: 100 },
      { identifier: 2, clientX: 120, clientY: 100 },
      { identifier: 3, clientX: 140, clientY: 100 },
    ],
  })
  await stream.dispatchEvent('touchend', { touches: [] })
  await expect(page.getByTestId('stream-overlays')).toHaveAttribute('data-hidden', 'true')
  expect(sentCommands).toHaveLength(0)

  await stream.dispatchEvent('touchstart', {
    touches: [
      { identifier: 1, clientX: 100, clientY: 100 },
      { identifier: 2, clientX: 120, clientY: 100 },
      { identifier: 3, clientX: 140, clientY: 100 },
    ],
  })
  await stream.dispatchEvent('touchend', { touches: [] })
  await expect(page.getByTestId('stream-overlays')).toHaveAttribute('data-hidden', 'false')
  expect(sentCommands).toHaveLength(0)

  // 5. Dock bounded in 926x428 viewport, scrolls horizontally with 64 apps
  const dock = page.getByTestId('floating-dock')
  await expect(dock).toBeVisible()
  const dockBox = await dock.boundingBox()
  expect((dockBox?.x ?? 0) + (dockBox?.width ?? 0)).toBeLessThanOrEqual(926)
  expect((dockBox?.y ?? 0) + (dockBox?.height ?? 0)).toBeLessThanOrEqual(428)

  const carousel = page.getByRole('region', { name: 'Applications' })
  await expect.poll(() => carousel.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true)

  // Check app size >= 44px
  const appButton = page.getByRole('button', { name: 'Open App 0' })
  const appBox = await appButton.boundingBox()
  expect(appBox?.width ?? 0).toBeGreaterThanOrEqual(44)
  expect(appBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  // Check utility button (App Library) is outside scroll region
  const appLibBtn = page.getByRole('button', { name: 'Open app library' })
  await expect(appLibBtn).toBeVisible()
  const isInsideCarousel = await carousel.evaluate((node, child) => node.contains(child), await appLibBtn.elementHandle())
  expect(isInsideCarousel).toBe(false)

  // Check gestures on dock do NOT leak to remote input
  sentCommands.length = 0
  await appButton.dispatchEvent('touchstart', {
    touches: [{ identifier: 1, clientX: 10, clientY: 10 }],
  })
  await appButton.dispatchEvent('touchmove', {
    touches: [{ identifier: 1, clientX: 30, clientY: 10 }],
  })
  await appButton.dispatchEvent('touchend', { touches: [] })
  expect(sentCommands).toHaveLength(0)
})
