import type { InputCommand } from './input-engine.ts'

export type StreamEventType =
  | 'connected'
  | 'disconnected'
  | 'telemetry'
  | 'remote-stream'
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
}

interface StreamEngineDependencies {
  createPeerConnection: (configuration: RTCConfiguration) => RTCPeerConnection
  createWebSocket: (url: string) => WebSocket
  createMediaStream: (tracks: MediaStreamTrack[]) => MediaStream
}

const defaultDependencies: StreamEngineDependencies = {
  createPeerConnection: (configuration) => new RTCPeerConnection(configuration),
  createWebSocket: (url) => new WebSocket(url),
  createMediaStream: (tracks) => new MediaStream(tracks),
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
  private readonly dependencies: StreamEngineDependencies

  constructor(options: StreamEngineOptions = {}) {
    this.dependencies = {
      createPeerConnection: options.createPeerConnection ?? defaultDependencies.createPeerConnection,
      createWebSocket: options.createWebSocket ?? defaultDependencies.createWebSocket,
      createMediaStream: options.createMediaStream ?? defaultDependencies.createMediaStream,
    }
  }

  get isConnected(): boolean {
    return this._isConnected
  }

  async connect(url: string, callback: StreamEventCallback): Promise<MediaStream | null> {
    this.disconnect()
    this.callback = callback

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

      const socket = this.dependencies.createWebSocket(url)
      this.socket = socket
      this.configureSignaling(socket, pc, url)
    } catch (error) {
      this.enterMockMode(url, error)
    }

    // Remote streams arrive asynchronously through the remote-stream event.
    return null
  }

  sendInput(command: InputCommand): boolean {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') return false
    this.dataChannel.send(JSON.stringify(command))
    return true
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

  private configureSignaling(socket: WebSocket, pc: RTCPeerConnection, url: string): void {
    socket.onopen = () => {
      void (async () => {
        try {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          this.sendSignal({ type: 'offer', sdp: offer.sdp })
        } catch (error) {
          this.enterMockMode(url, error)
        }
      })()
    }
    socket.onmessage = (event: MessageEvent<string>) => {
      void this.handleSignal(pc, event.data)
    }
    socket.onerror = (error) => this.enterMockMode(url, error)
    socket.onclose = () => {
      if (!this._isConnected) this.enterMockMode(url)
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
}
