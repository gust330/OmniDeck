import type { InputCommand } from './input-engine.ts'

export type StreamEventType =
  | 'connected'
  | 'disconnected'
  | 'telemetry'
  | 'remote-stream'
  | 'frame'
  | 'error'
  | 'ice-state'

export interface StreamEvent {
  type: StreamEventType
  data?: unknown
}

export type StreamEventCallback = (event: StreamEvent) => void

export interface StreamEngineOptions {
  createPeerConnection?: (configuration: RTCConfiguration) => RTCPeerConnection
  createWebSocket?: (url: string) => WebSocket
  createMediaStream?: (tracks: MediaStreamTrack[]) => MediaStream
  fetch?: typeof fetch
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
}

interface StreamEngineDependencies {
  createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection
  createWebSocket: (url: string) => WebSocket
  createMediaStream: (tracks: MediaStreamTrack[]) => MediaStream
  fetch: typeof fetch
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
}

const defaultDependencies: StreamEngineDependencies = {
  createPeerConnection: (configuration) => new RTCPeerConnection(configuration),
  createWebSocket: (url) => new WebSocket(url),
  createMediaStream: (tracks) => new MediaStream(tracks),
  fetch: (input, init) => (typeof window !== 'undefined' && window.fetch ? window.fetch(input, init) : fetch(input, init)),
  createObjectURL: (blob) => (typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : ''),
  revokeObjectURL: (url) => {
    if (typeof URL !== 'undefined' && URL.revokeObjectURL) {
      URL.revokeObjectURL(url)
    }
  },
}

export interface HostEndpoints {
  websocket: string
  http: string
}

export function resolveHostEndpoints(rawUrl: string): HostEndpoints {
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return { websocket: 'ws://localhost:8080/ws/stream', http: 'http://localhost:8080' }
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
  const normalized = hasScheme ? trimmed : `http://${trimmed}`
  const parsed = new URL(normalized)

  const isSecure = parsed.protocol === 'https:' || parsed.protocol === 'wss:'
  const httpScheme = isSecure ? 'https:' : 'http:'
  const wsScheme = isSecure ? 'wss:' : 'ws:'

  const http = `${httpScheme}//${parsed.host}`
  const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '/ws/stream'
  const websocket = `${wsScheme}//${parsed.host}${pathname}${parsed.search}`

  return { websocket, http }
}

type SignalingMessage = {
  type?: string
  sdp?: string
  candidate?: RTCIceCandidateInit
}

export class StreamEngine {
  private pc: RTCPeerConnection | null = null
  private dataChannel: RTCDataChannel | null = null
  private socket: WebSocket | null = null
  private callback: StreamEventCallback | null = null
  private _isConnected = false
  private mockMode = false
  private endpoints: HostEndpoints = { websocket: '', http: '' }
  private currentFrameUrl: string | null = null
  private readonly dependencies: StreamEngineDependencies

  constructor(options: StreamEngineOptions = {}) {
    this.dependencies = {
      createPeerConnection: options.createPeerConnection ?? defaultDependencies.createPeerConnection,
      createWebSocket: options.createWebSocket ?? defaultDependencies.createWebSocket,
      createMediaStream: options.createMediaStream ?? defaultDependencies.createMediaStream,
      fetch: options.fetch ?? defaultDependencies.fetch,
      createObjectURL: options.createObjectURL ?? defaultDependencies.createObjectURL,
      revokeObjectURL: options.revokeObjectURL ?? defaultDependencies.revokeObjectURL,
    }
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  configureEndpoint(url: string): void {
    this.endpoints = resolveHostEndpoints(url)
  }

  async connect(url: string, callback: StreamEventCallback): Promise<MediaStream | null> {
    this.disconnect()
    this.callback = callback
    this.configureEndpoint(url)

    const isJpegHost = (() => {
      const trimmed = url.trim()
      if (!trimmed) return true
      try {
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
        const normalized = hasScheme ? trimmed : `http://${trimmed}`
        const parsed = new URL(normalized)
        if (parsed.port === '8080') return true
        if (parsed.pathname === '/ws/stream') return true
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return true
        return false
      } catch {
        return false
      }
    })()

    try {
      const socket = this.dependencies.createWebSocket(this.endpoints.websocket)
      this.socket = socket
      try {
        socket.binaryType = 'arraybuffer'
      } catch {
        // Some mock websockets may make binaryType read-only
      }

      if (isJpegHost) {
        this.configureHostSocket(socket, url)
      } else {
        try {
          const pc = this.dependencies.createPeerConnection({
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
          })
          this.pc = pc
          this.configurePeerConnection(pc, url)

          const channel = pc.createDataChannel('omnideck-io', { ordered: false })
          this.dataChannel = channel
          this.configureDataChannel(channel, url)
          this.configureSignaling(socket, pc, url)
        } catch {
          this.configureHostSocket(socket, url)
        }
      }
    } catch (error) {
      this.enterMockMode(url, error)
    }

    // Remote streams arrive asynchronously through the remote-stream event.
    return null
  }

  sendInput(command: InputCommand): boolean {
    const socketOpenState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1
    if (this.socket && this.socket.readyState === socketOpenState) {
      try {
        this.socket.send(JSON.stringify({ type: 'input', data: command }))
        return true
      } catch {
        // Fall back to data channel if socket send fails
      }
    }

    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return false
    this.dataChannel.send(JSON.stringify(command))
    return true
  }

  async listApps(): Promise<unknown[]> {
    const payload = await this.request<{ apps?: unknown[] } | unknown[]>('/api/apps')
    return Array.isArray(payload) ? payload : payload.apps ?? []
  }

  async launchApp(appId: string): Promise<void> {
    await this.request('/api/apps/launch', { appId })
  }

  async focusApp(appId: string): Promise<void> {
    await this.request('/api/focus', { appId })
  }

  async getStatus(): Promise<unknown> {
    return await this.request('/api/status')
  }

  async setVolume(volume: number): Promise<void> {
    await this.request('/api/volume', { volume: Math.min(100, Math.max(0, volume)) })
  }

  async setPower(action: 'lock' | 'suspend' | 'shutdown' | 'restart' | 'reboot' | 'wake'): Promise<void> {
    await this.request('/api/power', { action: action === 'restart' ? 'reboot' : action })
  }

  async setCrop(enabled: boolean): Promise<void> {
    await this.request('/api/crop', { enabled })
  }

  disconnect(): void {
    const callback = this.callback
    const wasActive = this._isConnected || this.pc !== null || this.socket !== null

    if (this.socket) {
      this.socket.onopen = null
      this.socket.onmessage = null
      this.socket.onerror = null
      this.socket.onclose = null
      try { this.socket.close() } catch { /* already closed */ }
      this.socket = null
    }

    if (this.dataChannel) {
      this.dataChannel.onopen = null
      this.dataChannel.onclose = null
      this.dataChannel.onerror = null
      this.dataChannel.onmessage = null
      try { this.dataChannel.close() } catch { /* already closed */ }
      this.dataChannel = null
    }

    if (this.pc) {
      this.pc.ontrack = null
      this.pc.onicecandidate = null
      this.pc.oniceconnectionstatechange = null
      try { this.pc.close() } catch { /* already closed */ }
      this.pc = null
    }

    this._isConnected = false
    this.mockMode = false
    if (this.currentFrameUrl) {
      this.dependencies.revokeObjectURL(this.currentFrameUrl)
      this.currentFrameUrl = null
    }
    if (wasActive) callback?.({ type: 'disconnected' })
    this.callback = null
  }

  private configureDataChannel(channel: RTCDataChannel, url: string): void {
    channel.onopen = () => {
      this.mockMode = false
      this._isConnected = true
      this.emit('connected', { url, channel: channel.label, mock: false })
    }
    channel.onclose = () => {
      if (this.mockMode) return
      this._isConnected = false
      this.emit('disconnected', { reason: 'data-channel-closed' })
    }
    channel.onerror = (event) => this.emit('error', event)
    channel.onmessage = (event: MessageEvent<string>) => {
      try {
        this.emit('telemetry', JSON.parse(event.data) as unknown)
      } catch (cause) {
        this.emit('error', { message: 'Failed to parse telemetry JSON', raw: event.data, cause })
      }
    }
  }

  private configurePeerConnection(pc: RTCPeerConnection, url: string): void {
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? this.dependencies.createMediaStream([event.track])
      this.emit('remote-stream', stream)
    }
    pc.onicecandidate = (event) => {
      if (!event.candidate) return
      const candidate =
        typeof event.candidate.toJSON === 'function'
          ? event.candidate.toJSON()
          : {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
              usernameFragment: event.candidate.usernameFragment,
            }
      this.sendSignal({ type: 'ice-candidate', candidate })
    }
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState
      this.emit('ice-state', { state })
      if (state === 'connected' || state === 'completed') {
        this.mockMode = false
        this._isConnected = true
      } else if (state === 'failed') {
        this.emit('error', { message: 'ICE connection failed' })
        this.enterMockMode(url)
      } else if ((state === 'disconnected' || state === 'closed') && !this.mockMode) {
        this._isConnected = false
      }
    }
  }

  private configureHostSocket(socket: WebSocket, url: string): void {
    socket.onopen = () => {
      this._isConnected = true
      this.mockMode = false
      this.emit('connected', { url, mock: false, websocket: this.endpoints.websocket })
    }
    socket.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        this.emit('frame', data.type ? data : new Blob([data], { type: 'image/jpeg' }))
        return
      }

      if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
        this.emit('frame', new Blob([data], { type: 'image/jpeg' }))
        return
      }

      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>
          if (parsed.type === 'telemetry') {
            this.emit('telemetry', (parsed.data ?? parsed.payload ?? parsed) as unknown)
            return
          }
          if (parsed.type === 'frame' && typeof parsed.data === 'string') {
            this.emit('frame', parsed.data)
            return
          }
        } catch {
          // Ignore unstructured non-JSON text
        }
      }
    }
    socket.onerror = (error) => this.enterMockMode(url, error)
    socket.onclose = () => {
      if (this.mockMode) return
      if (!this._isConnected) {
        this.enterMockMode(url)
        return
      }
      this._isConnected = false
      this.emit('disconnected', { reason: 'socket-closed' })
    }
  }

  private configureSignaling(socket: WebSocket, pc: RTCPeerConnection, url: string): void {
    socket.onopen = () => {
      this._isConnected = true
      this.mockMode = false
      this.emit('connected', { url, mock: false, websocket: this.endpoints.websocket })

      void (async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          this.sendSignal({ type: 'offer', sdp: offer.sdp })
        } catch (error) {
          // Failure to create WebRTC offer is tolerated if binary/websocket streaming works
        }
      })()
    }
    socket.onmessage = (event: MessageEvent) => {
      const data = event.data
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        this.emit('frame', data.type ? data : new Blob([data], { type: 'image/jpeg' }))
        return
      }

      if (typeof ArrayBuffer !== 'undefined' && data instanceof ArrayBuffer) {
        this.emit('frame', new Blob([data], { type: 'image/jpeg' }))
        return
      }

      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>
          if (parsed.type === 'telemetry') {
            this.emit('telemetry', (parsed.data ?? parsed.payload ?? parsed) as unknown)
            return
          }
          if (parsed.type === 'frame' && typeof parsed.data === 'string') {
            this.emit('frame', parsed.data)
            return
          }
        } catch {
          // not structured telemetry JSON, fall through to WebRTC signal parser
        }
        void this.handleSignal(pc, data)
      }
    }
    socket.onerror = (error) => this.enterMockMode(url, error)
    socket.onclose = () => {
      if (this.mockMode) return
      if (!this._isConnected) {
        this.enterMockMode(url)
        return
      }
      this._isConnected = false
      this.emit('disconnected', { reason: 'socket-closed' })
    }
  }

  private async handleSignal(pc: RTCPeerConnection, raw: string): Promise<void> {
    try {
      const message = JSON.parse(raw) as SignalingMessage
      if (message.type === 'answer' && message.sdp) {
        await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      } else if (message.type === 'ice-candidate' && message.candidate) {
        await pc.addIceCandidate(message.candidate)
      }
    } catch (error) {
      this.emit('error', { message: 'Invalid signaling message', raw, cause: error })
    }
  }

  private sendSignal(message: SignalingMessage): void {
    const socketOpenState = typeof WebSocket !== 'undefined' ? WebSocket.OPEN : 1
    if (this.socket?.readyState === socketOpenState) {
      this.socket.send(JSON.stringify(message))
    }
  }

  private enterMockMode(url: string, error?: unknown): void {
    if (error) this.emit('error', error)
    if (this.mockMode) return
    this.mockMode = true
    this._isConnected = true
    this.emit('connected', { url, mock: true })
  }

  private emit(type: StreamEventType, data?: unknown): void {
    this.callback?.({ type, data })
  }

  private async request<T = unknown>(path: string, body?: unknown): Promise<T> {
    const base = this.endpoints.http || 'http://localhost:8080'
    const url = `${base}${path.startsWith('/') ? '' : '/'}${path}`
    const init: RequestInit = body !== undefined
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : { method: 'GET' }

    const response = await this.dependencies.fetch(url, init)
    if (!response.ok) {
      throw new Error(`Host request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
}
