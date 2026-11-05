import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StreamEngine, type StreamEvent } from '@/engines/stream-engine'
import type { InputCommand } from '@/engines/input-engine'

class MockDataChannel {
  label = 'omnideck-io'
  readyState: RTCDataChannelState = 'connecting'
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 'closed' })
}

class MockPeerConnection {
  channel = new MockDataChannel()
  localDescription: RTCSessionDescriptionInit | null = null
  remoteDescription: RTCSessionDescriptionInit | null = null
  iceConnectionState: RTCIceConnectionState = 'new'
  ontrack: ((event: RTCTrackEvent) => void) | null = null
  onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null
  oniceconnectionstatechange: (() => void) | null = null
  createDataChannel = vi.fn(() => this.channel as unknown as RTCDataChannel)
  createOffer = vi.fn(async () => ({ type: 'offer' as const, sdp: 'local-offer' }))
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => { this.localDescription = description })
  setRemoteDescription = vi.fn(async (description: RTCSessionDescriptionInit) => { this.remoteDescription = description })
  addIceCandidate = vi.fn(async () => undefined)
  close = vi.fn(() => { this.iceConnectionState = 'closed' })
}

class MockWebSocket {
  static readonly OPEN = 1
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent<string>) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: (() => void) | null = null
  send = vi.fn()
  close = vi.fn(() => { this.readyState = 3 })

  open() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  message(value: unknown) {
    this.onmessage?.({ data: typeof value === 'string' ? value : JSON.stringify(value) } as MessageEvent<string>)
  }
}

describe('StreamEngine', () => {
  let peer: MockPeerConnection
  let socket: MockWebSocket
  let events: StreamEvent[]
  let engine: StreamEngine

  beforeEach(() => {
    peer = new MockPeerConnection()
    socket = new MockWebSocket()
    events = []
    engine = new StreamEngine({
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createWebSocket: () => socket as unknown as WebSocket,
      createMediaStream: (tracks: MediaStreamTrack[]) => ({ tracks }) as unknown as MediaStream,
    })
  })

  it('negotiates an offer/answer and exchanges ICE candidates over the host WebSocket', async () => {
    await engine.connect('wss://host.test/signal', (event) => events.push(event))
    socket.open()
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'offer', sdp: 'local-offer' })))

    socket.message({ type: 'answer', sdp: 'remote-answer' })
    socket.message({ type: 'ice-candidate', candidate: { candidate: 'remote-candidate' } })
    await vi.waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalledWith({ type: 'answer', sdp: 'remote-answer' }))
    expect(peer.addIceCandidate).toHaveBeenCalledWith({ candidate: 'remote-candidate' })

    peer.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: 'local-candidate' }) } } as RTCPeerConnectionIceEvent)
    expect(socket.send).toHaveBeenLastCalledWith(JSON.stringify({ type: 'ice-candidate', candidate: { candidate: 'local-candidate' } }))
  })

  it('handles candidate objects without a toJSON method', async () => {
    await engine.connect('wss://host.test/signal', (event) => events.push(event))
    socket.open()

    peer.onicecandidate?.({
      candidate: { candidate: 'plain-candidate', sdpMid: 'video', sdpMLineIndex: 0 },
    } as unknown as RTCPeerConnectionIceEvent)

    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        type: 'ice-candidate',
        candidate: { candidate: 'plain-candidate', sdpMid: 'video', sdpMLineIndex: 0, usernameFragment: undefined },
      }),
    )
  })

  it('sends InputEngine commands only while the data channel is open', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    const command: InputCommand = { type: 'mouse-move', payload: { dx: 4, dy: -2 }, timestamp: 10 }

    expect(engine.sendInput(command)).toBe(false)
    expect(peer.channel.send).not.toHaveBeenCalled()

    peer.channel.readyState = 'open'
    peer.channel.onopen?.()
    expect(engine.sendInput(command)).toBe(true)

    expect(peer.channel.send).toHaveBeenCalledWith(JSON.stringify(command))
    expect(engine.isConnected).toBe(true)
    expect(events).toContainEqual(expect.objectContaining({ type: 'connected' }))
  })

  it('emits telemetry, parse failures, and remote media streams', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    peer.channel.onmessage?.({ data: '{"fps":60,"ping":8}' } as MessageEvent<string>)
    peer.channel.onmessage?.({ data: 'not-json' } as MessageEvent<string>)

    const stream = { id: 'remote' } as MediaStream
    peer.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent)

    expect(events).toContainEqual({ type: 'telemetry', data: { fps: 60, ping: 8 } })
    expect(events).toContainEqual({ type: 'remote-stream', data: stream })
    expect(events.some((event) => event.type === 'error')).toBe(true)
  })

  it('constructs a stream for a track event without a supplied stream', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    const track = { id: 'video-track' } as MediaStreamTrack
    peer.ontrack?.({ streams: [], track } as unknown as RTCTrackEvent)
    expect(events).toContainEqual({ type: 'remote-stream', data: { tracks: [track] } })
  })

  it('handles peer connection ICE connection state transitions', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))

    peer.iceConnectionState = 'connected'
    peer.oniceconnectionstatechange?.()
    expect(engine.isConnected).toBe(true)
    expect(events).toContainEqual({ type: 'ice-state', data: { state: 'connected' } })

    peer.iceConnectionState = 'failed'
    peer.oniceconnectionstatechange?.()
    expect(events.some((e) => e.type === 'error' && (e.data as { message: string }).message === 'ICE connection failed')).toBe(true)
    expect(engine.isConnected).toBe(false)
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'connection-failed' } })
  })

  it('handles invalid signaling messages gracefully with error events', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    socket.message('invalid-json{{{')
    expect(events.some((e) => e.type === 'error')).toBe(true)
  })

  it('reports connection failures without claiming a mock connection', async () => {
    engine = new StreamEngine({
      createPeerConnection: () => peer as unknown as RTCPeerConnection,
      createWebSocket: () => { throw new Error('WebSocket unavailable') },
      createMediaStream: (tracks: MediaStreamTrack[]) => ({ tracks }) as unknown as MediaStream,
    })

    await engine.connect('wss://offline-host', (event) => events.push(event))

    expect(engine.isConnected).toBe(false)
    expect(events.some((event) => event.type === 'connected')).toBe(false)
    expect(events).toContainEqual(expect.objectContaining({ type: 'error' }))
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'connection-failed' } })
  })

  it('reports a socket error without claiming a mock connection', async () => {
    await engine.connect('wss://offline-host', (event) => events.push(event))
    socket.onerror?.(new Event('error'))
    expect(engine.isConnected).toBe(false)
    expect(events.some((event) => event.type === 'connected')).toBe(false)
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'connection-failed' } })
  })

  it('reports disconnect when socket closes before connection is established', async () => {
    await engine.connect('wss://offline-host', (event) => events.push(event))
    socket.onclose?.()
    expect(engine.isConnected).toBe(false)
    expect(events.some((event) => event.type === 'connected')).toBe(false)
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'connection-failed' } })
  })

  it('emits error and disconnect events on data channel error and close', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    peer.channel.readyState = 'open'
    peer.channel.onopen?.()

    const channelErrorEvent = new Event('error')
    peer.channel.onerror?.(channelErrorEvent)
    expect(events).toContainEqual({ type: 'error', data: channelErrorEvent })

    peer.channel.onclose?.()
    expect(engine.isConnected).toBe(false)
    expect(events).toContainEqual({ type: 'disconnected', data: { reason: 'data-channel-closed' } })
  })

  it('opens an app atomically using its exact desktop ID and returns server metadata', async () => {
    const metadata = { app_id: 'org.custom.CAD.desktop', running: true, focused: true }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => metadata,
    })
    engine = new StreamEngine({ fetch: fetchMock as typeof fetch })
    engine.configureEndpoint('https://host.test')

    await expect(engine.openApp('org.custom.CAD.desktop')).resolves.toEqual(metadata)
    expect(fetchMock).toHaveBeenCalledWith('https://host.test/api/apps/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: 'org.custom.CAD.desktop' }),
    })
  })

  it('closes every resource and emits one disconnect event', async () => {
    await engine.connect('wss://host.test', (event) => events.push(event))
    peer.channel.readyState = 'open'
    peer.channel.onopen?.()

    engine.disconnect()
    engine.disconnect()

    expect(peer.channel.close).toHaveBeenCalledOnce()
    expect(peer.close).toHaveBeenCalledOnce()
    expect(socket.close).toHaveBeenCalledOnce()
    expect(events.filter((event) => event.type === 'disconnected')).toHaveLength(1)
    expect(engine.isConnected).toBe(false)
  })
})
