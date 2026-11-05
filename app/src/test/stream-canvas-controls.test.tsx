import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'

import { StreamCanvas } from '@/components/stream/StreamCanvas'
import { StreamWorkspace } from '@/components/stream/StreamWorkspace'
import ControlCenter from '@/components/control-center/ControlCenter'
import AppLibrary from '@/components/app-library/AppLibrary'
import { StreamEngine, type StreamEvent } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'
import { useTelemetryStore } from '@/stores/telemetry-store'

describe('StreamCanvas & Host Controls Integration', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'connected',
      hostConfig: {
        name: 'TITAN-RIG',
        url: 'http://192.168.1.100:8080',
        resolution: '4K',
        bitrate: 50,
        codec: 'av1',
      },
      volume: 75,
      singleWindowFocus: true,
      activeView: 'stream',
    })
    useTelemetryStore.getState().resetTelemetry()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders JPEG blobs to a canvas with bitmap replacement and cleanup', async () => {
    const bitmapOne = { close: vi.fn(), width: 1920, height: 1080 } as unknown as ImageBitmap
    const bitmapTwo = { close: vi.fn(), width: 1920, height: 1080 } as unknown as ImageBitmap
    const createImageBitmapMock = vi.fn()
      .mockResolvedValueOnce(bitmapOne)
      .mockResolvedValueOnce(bitmapTwo)
    vi.stubGlobal('createImageBitmap', createImageBitmapMock)

    const drawImage = vi.fn()
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingEnabled: false,
    } as unknown as CanvasRenderingContext2D)

    const { rerender, unmount } = render(<StreamCanvas frame={new Blob(['one'], { type: 'image/jpeg' })} />)
    await vi.waitFor(() => expect(drawImage).toHaveBeenCalledWith(bitmapOne, 0, 0, 1920, 1080))

    rerender(<StreamCanvas frame={new Blob(['two'], { type: 'image/jpeg' })} />)
    await vi.waitFor(() => expect(drawImage).toHaveBeenCalledWith(bitmapTwo, 0, 0, 1920, 1080))
    expect(bitmapOne.close).toHaveBeenCalledOnce()

    unmount()
    expect(bitmapTwo.close).toHaveBeenCalledOnce()
    getContext.mockRestore()
    vi.unstubAllGlobals()
  })

  it('does not let a newer frame cancel an in-flight JPEG decode', async () => {
    let resolveFirst!: (bitmap: ImageBitmap) => void
    let resolveSecond!: (bitmap: ImageBitmap) => void
    const bitmapOne = { close: vi.fn(), width: 800, height: 600 } as unknown as ImageBitmap
    const bitmapTwo = { close: vi.fn(), width: 800, height: 600 } as unknown as ImageBitmap
    vi.stubGlobal('createImageBitmap', vi.fn()
      .mockReturnValueOnce(new Promise<ImageBitmap>((resolve) => { resolveFirst = resolve }))
      .mockReturnValueOnce(new Promise<ImageBitmap>((resolve) => { resolveSecond = resolve })))
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
      imageSmoothingEnabled: false,
    } as unknown as CanvasRenderingContext2D)

    const { rerender } = render(<StreamCanvas frame={new Blob(['one'], { type: 'image/jpeg' })} />)
    rerender(<StreamCanvas frame={new Blob(['two'], { type: 'image/jpeg' })} />)
    resolveFirst(bitmapOne)
    await vi.waitFor(() => expect(drawImage).toHaveBeenCalledWith(bitmapOne, 0, 0, 800, 600))
    resolveSecond(bitmapTwo)
    await vi.waitFor(() => expect(drawImage).toHaveBeenCalledWith(bitmapTwo, 0, 0, 800, 600))
    vi.unstubAllGlobals()
  })

  it('updates StreamCanvas frame when StreamEngine emits a frame event', () => {
    let callback: ((event: StreamEvent) => void) | null = null
    vi.spyOn(StreamEngine.prototype, 'connect').mockImplementation(async (_url, cb) => {
      callback = cb
      return null
    })

    render(<StreamWorkspace />)
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to TITAN-RIG')
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()

    act(() => {
      callback?.({ type: 'frame', data: 'blob:stream-frame-live' })
    })

    expect(screen.getByTestId('live-stream-frame')).toBeInTheDocument()
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()
  })

  it('sends normalized coordinates on pointer/touch interaction over StreamCanvas', () => {
    const sendInputSpy = vi.spyOn(StreamEngine.prototype, 'sendInput')
    const { container } = render(<StreamWorkspace />)
    const canvas = container.querySelector('[data-ui]') as HTMLDivElement

    // Mock getBoundingClientRect
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      bottom: 500,
      right: 1000,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    fireEvent.touchStart(canvas, {
      touches: [{ identifier: 1, clientX: 250, clientY: 250 }],
    })
    fireEvent.touchEnd(canvas, {
      touches: [],
    })

    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mouse-click',
        payload: expect.objectContaining({
          button: 0,
          pressed: true,
          normalizedX: 0.25,
          normalizedY: 0.5,
        }),
      }),
    )
  })

  it('uses REST-only clients, exact desktop IDs, running state, and server power actions', async () => {
    const configureEndpointSpy = vi.spyOn(StreamEngine.prototype, 'configureEndpoint')
    const connectSpy = vi.spyOn(StreamEngine.prototype, 'connect')
    const setVolumeSpy = vi.spyOn(StreamEngine.prototype, 'setVolume').mockResolvedValue()
    const setCropSpy = vi.spyOn(StreamEngine.prototype, 'setCrop').mockResolvedValue()
    const setPowerSpy = vi.spyOn(StreamEngine.prototype, 'setPower').mockResolvedValue()
    const listAppsSpy = vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue([
      { id: 'org.custom.CAD.desktop', name: 'Custom CAD', running: false },
    ])
    const launchAppSpy = vi.spyOn(StreamEngine.prototype, 'launchApp').mockResolvedValue()
    const focusAppSpy = vi.spyOn(StreamEngine.prototype, 'focusApp').mockResolvedValue()

    const control = render(<ControlCenter />)
    fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '45' } })
    expect(setVolumeSpy).toHaveBeenCalledWith(45)

    fireEvent.click(screen.getByRole('switch', { name: 'Single Window Focus' }))
    expect(setCropSpy).toHaveBeenCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'Rig Sleep / Suspend' }))
    expect(setPowerSpy).toHaveBeenCalledWith('suspend')
    fireEvent.click(screen.getByRole('button', { name: 'Rig Restart' }))
    expect(setPowerSpy).toHaveBeenCalledWith('restart')
    fireEvent.change(screen.getByRole('slider', { name: 'Rig HDR Brightness' }), { target: { value: '35' } })
    expect(useConnectionStore.getState().brightness).toBe(35)
    fireEvent.click(screen.getByRole('button', { name: 'Studio Rig' }))
    expect(useConnectionStore.getState().audioRoute).toBe('rig')
    control.unmount()

    render(<AppLibrary />)
    expect(listAppsSpy).toHaveBeenCalled()
    const focusBtn = await screen.findByRole('button', { name: 'Focus Custom CAD on Phone' })
    expect(screen.getByText('Idle')).toBeInTheDocument()
    fireEvent.click(focusBtn)
    await vi.waitFor(() => expect(launchAppSpy).toHaveBeenCalledWith('org.custom.CAD.desktop'))
    expect(focusAppSpy).toHaveBeenCalledWith('org.custom.CAD.desktop')
    expect(configureEndpointSpy).toHaveBeenCalledWith('http://192.168.1.100:8080')
    expect(connectSpy).not.toHaveBeenCalled()

    useConnectionStore.setState({ activeView: 'app-library' })
    const switchDesktopBtn = screen.getByRole('button', { name: 'Switch to full desktop stream' })
    fireEvent.click(switchDesktopBtn)
    expect(setCropSpy).toHaveBeenCalledWith(false)
    expect(useConnectionStore.getState().activeView).toBe('stream')
  })
})
