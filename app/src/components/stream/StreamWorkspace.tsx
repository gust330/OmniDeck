import { useEffect, useRef, useState } from 'react'

import { InputEngine } from '@/engines/input-engine'
import { StreamEngine, type StreamEvent } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'
import { useTelemetryStore } from '@/stores/telemetry-store'
import { useInputStore } from '@/stores/input-store'
import type { TelemetryData } from '@/types'
import { ActionPod } from './ActionPod'
import { DynamicIslandHUD } from './DynamicIslandHUD'
import { FloatingDock } from './FloatingDock'
import { ModifierRibbon } from './ModifierRibbon'
import { StreamCanvas } from './StreamCanvas'

export function StreamWorkspace() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const inputEngineRef = useRef<InputEngine | null>(null)
  const streamEngineRef = useRef<StreamEngine | null>(null)
  const reconnectRef = useRef<() => void>(() => {})
  const disconnectRef = useRef<() => void>(() => {})
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [frame, setFrame] = useState<Blob | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [overlaysHidden, setOverlaysHidden] = useState(false)

  const hostUrl = useConnectionStore((state) => state.hostConfig.url)
  const hostName = useConnectionStore((state) => state.hostConfig.name)
  const status = useConnectionStore((state) => state.status)
  const updateTelemetry = useTelemetryStore((state) => state.updateTelemetry)
  const setNormalizedCursor = useInputStore((state) => state.setNormalizedCursor)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const streamEngine = new StreamEngine()
    streamEngineRef.current = streamEngine

    const handleStreamEvent = (event: StreamEvent) => {
      switch (event.type) {
        case 'connected':
          useConnectionStore.getState().setStatus('connected')
          setStreamError(null)
          break
        case 'disconnected':
          useConnectionStore.getState().setStatus('disconnected')
          setRemoteStream(null)
          setFrame(null)
          setFrameUrl(null)
          break
        case 'remote-stream':
          setRemoteStream((event.data as MediaStream) ?? null)
          setStreamError(null)
          break
        case 'frame':
          if (typeof Blob !== 'undefined' && event.data instanceof Blob) {
            setFrame(event.data)
            setFrameUrl(null)
            setStreamError(null)
          } else if (typeof event.data === 'string') {
            setFrameUrl(event.data)
            setFrame(null)
            setStreamError(null)
          }
          break
        case 'telemetry':
          if (event.data && typeof event.data === 'object') {
            const data = event.data as Partial<TelemetryData>
            updateTelemetry({
              ...data,
              gpu: typeof data.gpu === 'number' ? data.gpu : 0,
            })
          }
          break
        case 'error': {
          const message =
            event.data && typeof event.data === 'object' && 'message' in event.data
              ? String((event.data as { message: unknown }).message)
              : typeof event.data === 'string'
                ? event.data
                : 'Host connection failed'
          setStreamError(message)
          break
        }
        case 'ice-state':
          break
      }
    }

    const connectStream = () => {
      useConnectionStore.getState().setStatus('connecting')
      setStreamError(null)
      void streamEngine.connect(hostUrl, handleStreamEvent)
    }

    const disconnectStream = () => {
      streamEngine.disconnect()
      useConnectionStore.getState().setStatus('disconnected')
      setRemoteStream(null)
      setFrame(null)
      setFrameUrl(null)
      setStreamError(null)
    }

    reconnectRef.current = connectStream
    disconnectRef.current = disconnectStream
    connectStream()

    const inputEngine = new InputEngine()
    inputEngineRef.current = inputEngine
    inputEngine.attach(
      canvas,
      (command) => {
        if (command.type === 'mouse-move') {
          const payload = command.payload as { normalizedX?: number; normalizedY?: number; dx?: number; dy?: number }
          if (typeof payload.normalizedX === 'number' && typeof payload.normalizedY === 'number') {
            setNormalizedCursor(payload.normalizedX, payload.normalizedY)
          } else if (typeof payload.dx === 'number' && typeof payload.dy === 'number') {
            useInputStore.getState().moveCursor(payload.dx, payload.dy)
          }
        }
        streamEngine.sendInput(command)
      },
      () => useInputStore.getState().modifiers,
      () => useInputStore.getState().consumeLatched(),
      () => setOverlaysHidden((prev) => !prev),
    )

    return () => {
      inputEngine.detach()
      inputEngineRef.current = null
      streamEngine.disconnect()
      streamEngineRef.current = null
      setRemoteStream(null)
      setFrame(null)
      setFrameUrl(null)
      setStreamError(null)
    }
  }, [hostUrl, setNormalizedCursor, updateTelemetry])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
      <StreamCanvas
        canvasRef={canvasRef}
        remoteStream={remoteStream}
        frame={frame}
        frameUrl={frameUrl}
        status={status}
        error={streamError}
        hostName={hostName}
      />
      <div
        data-testid="stream-overlays"
        data-hidden={overlaysHidden ? 'true' : 'false'}
        className="pointer-events-none absolute inset-0 z-20"
      >
        <div
          className={`transition-all duration-300 ease-in-out ${
            overlaysHidden ? '-translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'
          }`}
        >
          <DynamicIslandHUD
            onDisconnect={() => disconnectRef.current()}
            onReconnect={() => reconnectRef.current()}
          />
        </div>
        <div className="pointer-events-none absolute inset-x-5 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between">
          <div
            className={`transition-all duration-300 ease-in-out ${
              overlaysHidden ? '-translate-x-24 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100 pointer-events-auto'
            }`}
          >
            <ModifierRibbon />
          </div>
          <div
            className={`transition-all duration-300 ease-in-out ${
              overlaysHidden ? 'translate-x-24 opacity-0 pointer-events-none' : 'translate-x-0 opacity-100 pointer-events-auto'
            }`}
          >
            <ActionPod
              onRightClick={() => inputEngineRef.current?.rightClick()}
              onScroll={(deltaY) => inputEngineRef.current?.scroll(deltaY)}
            />
          </div>
        </div>
        <div
          className={`transition-all duration-300 ease-in-out ${
            overlaysHidden ? 'translate-y-24 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'
          }`}
        >
          <FloatingDock />
        </div>
      </div>
      <button
        type="button"
        aria-label="Reveal controls"
        onClick={() => setOverlaysHidden(false)}
        className={`fixed top-3 right-4 z-40 rounded-full border border-white/10 bg-black/60 px-2.5 py-1 text-[11px] text-white/50 backdrop-blur transition-all duration-300 hover:text-white ${
          overlaysHidden ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none -translate-y-4'
        }`}
      >
        Show Controls
      </button>
    </main>
  )
}

export default StreamWorkspace
