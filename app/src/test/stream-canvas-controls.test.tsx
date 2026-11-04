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

  it('renders a live JPEG frame in StreamCanvas when frameUrl is provided', () => {
    render(<StreamCanvas frameUrl="blob:http://localhost/frame-100" />)
    const img = screen.getByTestId('live-stream-frame')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'blob:http://localhost/frame-100')
    expect(screen.queryByText('pipeline_render.rs')).not.toBeInTheDocument()
  })

  it('updates StreamCanvas frame when StreamEngine emits a frame event', () => {
    let callback: ((event: StreamEvent) => void) | null = null
    vi.spyOn(StreamEngine.prototype, 'connect').mockImplementation(async (_url, cb) => {
      callback = cb
      return null
    })

    render(<StreamWorkspace />)
    expect(screen.getByText('pipeline_render.rs')).toBeInTheDocument()

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
    control.unmount()

    render(<AppLibrary />)
    expect(listAppsSpy).toHaveBeenCalled()
    const focusBtn = await screen.findByRole('button', { name: 'Focus Custom CAD on Phone' })
    expect(screen.getByText('Idle')).toBeInTheDocument()
    fireEvent.click(focusBtn)
    expect(focusAppSpy).toHaveBeenCalledWith('org.custom.CAD.desktop')
    expect(configureEndpointSpy).toHaveBeenCalledWith('http://192.168.1.100:8080')
    expect(connectSpy).not.toHaveBeenCalled()
  })
})
