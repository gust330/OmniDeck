import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { StreamWorkspace } from '@/components/stream/StreamWorkspace'
import { StreamEngine, type StreamEvent } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'
import { useInputStore } from '@/stores/input-store'
import { useTelemetryStore } from '@/stores/telemetry-store'

describe('StreamWorkspace Integration', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'disconnected',
      hostConfig: {
        name: 'TITAN-RIG',
        url: 'wss://192.168.1.100:9090',
        resolution: '4K',
        bitrate: 50,
        codec: 'av1',
      },
      activeView: 'stream',
    })
    useTelemetryStore.getState().resetTelemetry()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects StreamEngine on mount and shows an explicit connecting state instead of demo content', () => {
    const connectSpy = vi.spyOn(StreamEngine.prototype, 'connect')
    const { unmount } = render(<StreamWorkspace />)

    expect(connectSpy).toHaveBeenCalledWith('wss://192.168.1.100:9090', expect.any(Function))
    expect(screen.getByRole('status')).toHaveTextContent('Connecting to TITAN-RIG')
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()
    expect(screen.queryByText('Terminal — zsh')).not.toBeInTheDocument()
    expect(screen.queryByTestId('live-stream-video')).not.toBeInTheDocument()

    unmount()
  })

  it('forwards InputEngine mouse and keyboard commands to StreamEngine.sendInput', () => {
    const sendInputSpy = vi.spyOn(StreamEngine.prototype, 'sendInput')
    const { container, unmount } = render(<StreamWorkspace />)

    const canvas = container.querySelector('[data-ui]') as HTMLDivElement
    expect(canvas).toBeInTheDocument()

    fireEvent.mouseDown(canvas, { button: 0 })
    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mouse-click',
        payload: { button: 0, pressed: true },
      }),
    )

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', code: 'KeyG' }))
    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'key-down',
        payload: expect.objectContaining({ key: 'g', code: 'KeyG' }),
      }),
    )

    unmount()
  })

  it('forwards ActionPod controls and applies ribbon modifiers to keyboard input', () => {
    const sendInputSpy = vi.spyOn(StreamEngine.prototype, 'sendInput')
    render(<StreamWorkspace />)

    fireEvent.click(screen.getByLabelText('Ctrl'))
    fireEvent.click(screen.getByLabelText('Right Click'))

    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mouse-click',
        payload: expect.objectContaining({ button: 2, pressed: true }),
      }),
    )

    const slider = screen.getByRole('slider', { name: 'Scroll velocity' })
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      top: 100,
      height: 100,
      bottom: 200,
      left: 0,
      right: 32,
      width: 32,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    })
    fireEvent.pointerDown(slider, { pointerId: 1, clientY: 175 })
    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'mouse-scroll',
        payload: { deltaX: 0, deltaY: 50 },
      }),
    )
    fireEvent.pointerUp(slider, { pointerId: 1 })

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC' }))
    })
    expect(sendInputSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'key-down',
        payload: expect.objectContaining({ key: 'c', ctrlKey: true }),
      }),
    )
    expect(useInputStore.getState().modifiers.Control).toBe('inactive')
    expect(screen.getByLabelText('Ctrl')).toHaveAttribute('data-state', 'inactive')
  })

  it('updates stores and switches canvas when remote-stream and telemetry events arrive', () => {
    let streamCallback: ((event: StreamEvent) => void) | null = null
    vi.spyOn(StreamEngine.prototype, 'connect').mockImplementation(async (_url, callback) => {
      streamCallback = callback
      return null
    })

    const { unmount } = render(<StreamWorkspace />)
    expect(streamCallback).toBeTypeOf('function')

    // Emit telemetry
    act(() => {
      streamCallback?.({
        type: 'telemetry',
        data: { fps: 119.5, ping: 1.8, bitrate: 62 },
      })
    })

    expect(useTelemetryStore.getState().fps).toBe(119.5)
    expect(useTelemetryStore.getState().ping).toBe(1.8)
    expect(useTelemetryStore.getState().bitrate).toBe(62)
    expect(useTelemetryStore.getState().gpu).toBe(0)

    // Emit remote stream
    const mockMediaStream = { id: 'live-stream' } as unknown as MediaStream
    act(() => {
      streamCallback?.({
        type: 'remote-stream',
        data: mockMediaStream,
      })
    })

    expect(screen.getByTestId('live-stream-video')).toBeInTheDocument()
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()

    // Emit disconnected -> shows an explicit offline state
    act(() => {
      streamCallback?.({
        type: 'disconnected',
      })
    })
    expect(useConnectionStore.getState().status).toBe('disconnected')
    expect(screen.queryByTestId('live-stream-video')).not.toBeInTheDocument()
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Host stream disconnected')

    unmount()
  })

  it('disconnects and reconnects the stream from workspace controls', () => {
    let callback: ((event: StreamEvent) => void) | null = null
    const connectSpy = vi.spyOn(StreamEngine.prototype, 'connect').mockImplementation(async (_url, cb) => {
      callback = cb
      return null
    })
    const disconnectSpy = vi.spyOn(StreamEngine.prototype, 'disconnect')
    render(<StreamWorkspace />)

    act(() => callback?.({ type: 'connected' }))
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }))
    expect(disconnectSpy).toHaveBeenCalled()
    expect(useConnectionStore.getState().status).toBe('disconnected')

    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  it('disconnects StreamEngine and cleans up listeners on unmount', () => {
    const disconnectSpy = vi.spyOn(StreamEngine.prototype, 'disconnect')
    const { unmount } = render(<StreamWorkspace />)

    unmount()
    expect(disconnectSpy).toHaveBeenCalled()
  })
})
