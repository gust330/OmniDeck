import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FloatingDock } from '@/components/stream/FloatingDock'
import { StreamEngine } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'

const remoteApps = Array.from({ length: 18 }, (_, index) => ({
  id: `org.example.App${index}.desktop`,
  name: `App ${index}`,
  running: false,
}))

describe('FloatingDock carousel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue(remoteApps)
    useConnectionStore.setState({
      hostConfig: {
        ...useConnectionStore.getState().hostConfig,
        url: 'http://rig-one:8080',
      },
    })
  })

  it('keeps every discovered app in a bounded horizontal snap carousel', async () => {
    render(<FloatingDock />)

    const carousel = await screen.findByRole('region', { name: 'Applications' })
    expect(carousel).toHaveClass('max-w-full', 'overflow-x-auto', 'touch-pan-x', 'snap-x')
    expect(within(carousel).getAllByRole('button')).toHaveLength(remoteApps.length)
    expect(within(carousel).getByRole('button', { name: 'Open App 17' })).toHaveClass(
      'h-12',
      'w-12',
      'shrink-0',
      'snap-start',
    )
  })

  it('keeps the library and utility buttons fixed outside the apps scroll region', async () => {
    render(<FloatingDock />)

    const carousel = await screen.findByRole('region', { name: 'Applications' })
    const libraryButton = screen.getByRole('button', { name: 'Open app library' })

    expect(carousel).not.toContainElement(libraryButton)
    expect(libraryButton).toBeVisible()
  })

  it('ensures all app launchers and dock utility buttons satisfy the >= 44px touch target requirement', async () => {
    render(<FloatingDock />)

    const buttons = await screen.findAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)

    for (const button of buttons) {
      const className = button.getAttribute('class') ?? ''
      const has44pxMin =
        (className.includes('min-h-[44px]') && className.includes('min-w-[44px]')) ||
        (className.includes('h-12') && className.includes('w-12'))
      expect(has44pxMin).toBe(true)
    }
  })

  it('bounds the dock root and navigation inside the 926x428 viewport envelope', async () => {
    render(<FloatingDock />)

    const dockRoot = screen.getByTestId('floating-dock')
    expect(dockRoot).toHaveClass('max-w-[min(926px,calc(100vw-1.5rem))]', 'max-h-[428px]')

    const nav = screen.getByRole('navigation', { name: 'Application dock' })
    expect(nav).toHaveClass('max-w-full')
  })

  it('stops pointer, touch, and wheel event propagation to prevent remote gesture leakage', async () => {
    const parentPointerDown = vi.fn()
    const parentTouchStart = vi.fn()
    const parentWheel = vi.fn()

    render(
      <div
        onPointerDown={parentPointerDown}
        onTouchStart={parentTouchStart}
        onWheel={parentWheel}
      >
        <FloatingDock />
      </div>,
    )

    const nav = screen.getByRole('navigation', { name: 'Application dock' })
    fireEvent.pointerDown(nav)
    fireEvent.touchStart(nav)
    fireEvent.wheel(nav)

    expect(parentPointerDown).not.toHaveBeenCalled()
    expect(parentTouchStart).not.toHaveBeenCalled()
    expect(parentWheel).not.toHaveBeenCalled()
  })
})
