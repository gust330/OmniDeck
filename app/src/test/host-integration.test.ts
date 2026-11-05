import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamEngine, resolveHostEndpoints } from '@/engines/stream-engine'
import type { InputCommand } from '@/engines/input-engine'

class HostSocket {
  static OPEN = 1
  readyState = 0
  binaryType = ''
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn()
}

describe('host-server integration', () => {
  let socket: HostSocket
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    socket = new HostSocket()
    fetchMock = vi.fn<typeof fetch>(async () => ({ ok: true, json: async () => ({ apps: [] }) } as Response))
  })

  it('derives plain default server endpoints on port 8080', () => {
    expect(resolveHostEndpoints('')).toEqual({
      websocket: 'ws://localhost:8080/ws/stream',
      http: 'http://localhost:8080',
    })
    expect(resolveHostEndpoints('http://rig.local:8080')).toEqual({
      websocket: 'ws://rig.local:8080/ws/stream',
      http: 'http://rig.local:8080',
    })
    expect(resolveHostEndpoints('wss://rig.example/base')).toEqual({
      websocket: 'wss://rig.example/base',
      http: 'https://rig.example',
    })
  })

  it('passes binary JPEG frames directly to the renderer without object-URL churn', async () => {
    const events: Array<{ type: string; data?: unknown }> = []
    const createObjectURL = vi.fn(() => 'blob:frame-1')
    const engine = new StreamEngine({
      createWebSocket: () => socket as unknown as WebSocket,
      fetch: fetchMock,
      createObjectURL,
      revokeObjectURL: vi.fn(),
    })

    await engine.connect('http://rig.local:9090', (event) => events.push(event))
    expect(socket.binaryType).toBe('arraybuffer')
    socket.readyState = HostSocket.OPEN
    socket.onopen?.()
    const frame = new ArrayBuffer(4)
    socket.onmessage?.({ data: frame } as MessageEvent)
    socket.onmessage?.({ data: JSON.stringify({ type: 'telemetry', data: { fps: 60, ping: 8 } }) } as MessageEvent)

    expect(events).toContainEqual({ type: 'frame', data: expect.any(Blob) })
    expect((events.find((event) => event.type === 'frame')?.data as Blob).type).toBe('image/jpeg')
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(events).toContainEqual({ type: 'telemetry', data: { fps: 60, ping: 8 } })
  })

  it('sends normalized pointer input and host controls as JSON', async () => {
    const engine = new StreamEngine({ createWebSocket: () => socket as unknown as WebSocket, fetch: fetchMock })
    await engine.connect('ws://rig.local:9090/ws', vi.fn())
    socket.readyState = HostSocket.OPEN
    socket.onopen?.()

    const command: InputCommand = { type: 'mouse-move', payload: { x: 0.25, y: 0.75, dx: 3, dy: -2 }, timestamp: 5 }
    expect(engine.sendInput(command)).toBe(true)
    expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'input', data: command }))
  })

  it('configures REST calls without creating streaming sockets', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ apps: [{ id: 'code.desktop', name: 'Code', running: true }] }) } as Response)
    const createWebSocket = vi.fn(() => socket as unknown as WebSocket)
    const engine = new StreamEngine({ createWebSocket, fetch: fetchMock })
    engine.configureEndpoint('http://rig.local:8080')

    await engine.listApps()
    await engine.launchApp('code.desktop')
    await engine.focusApp('code.desktop')
    await engine.setVolume(42)
    await engine.setPower('restart')
    await engine.setPower('lock')
    await engine.setCrop(true)

    expect(createWebSocket).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://rig.local:8080/api/apps', expect.objectContaining({ method: 'GET' }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://rig.local:8080/api/apps/launch', expect.objectContaining({ body: '{"appId":"code.desktop"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://rig.local:8080/api/focus', expect.objectContaining({ body: '{"appId":"code.desktop"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(4, 'http://rig.local:8080/api/volume', expect.objectContaining({ body: '{"volume":42}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(5, 'http://rig.local:8080/api/power', expect.objectContaining({ body: '{"action":"reboot"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(6, 'http://rig.local:8080/api/power', expect.objectContaining({ body: '{"action":"lock"}' }))
    expect(fetchMock).toHaveBeenNthCalledWith(7, 'http://rig.local:8080/api/crop', expect.objectContaining({ body: '{"enabled":true}' }))
  })

  it('emits disconnected and clears connection state when the host socket closes', async () => {
    const events: Array<{ type: string; data?: unknown }> = []
    const engine = new StreamEngine({
      createWebSocket: () => socket as unknown as WebSocket,
      createPeerConnection: () => { throw new Error('JPEG stream') },
      fetch: fetchMock,
    })
    await engine.connect('http://rig.local:8080', (event) => events.push(event))
    socket.readyState = HostSocket.OPEN
    socket.onopen?.()
    socket.onclose?.()

    expect(engine.isConnected).toBe(false)
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'socket-closed' } })
  })

  it('does not create a WebRTC offer for the JPEG stream endpoint', async () => {
    const createPeerConnection = vi.fn()
    const engine = new StreamEngine({
      createWebSocket: () => socket as unknown as WebSocket,
      createPeerConnection,
      fetch: fetchMock,
    })
    await engine.connect('http://rig.local:8080', vi.fn())
    expect(createPeerConnection).not.toHaveBeenCalled()
  })
})
