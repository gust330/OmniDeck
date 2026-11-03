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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  const hostUrl = useConnectionStore((state) => state.hostConfig.url)
  const setStatus = useConnectionStore((state) => state.setStatus)
  const updateTelemetry = useTelemetryStore((state) => state.updateTelemetry)
  const moveCursor = useInputStore((state) => state.moveCursor)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const streamEngine = new StreamEngine()
    streamEngineRef.current = streamEngine

    const handleStreamEvent = (event: StreamEvent) => {
      switch (event.type) {
        case 'connected':
          setStatus('connected')
          break
        case 'disconnected':
          setStatus('disconnected')
          setRemoteStream(null)
          break
        case 'remote-stream':
          setRemoteStream((event.data as MediaStream) ?? null)
          break
        case 'telemetry':
          if (event.data && typeof event.data === 'object') {
            updateTelemetry(event.data as Partial<TelemetryData>)
          }
          break
        case 'error':
        case 'ice-state':
          break
      }
    }

    void streamEngine.connect(hostUrl, handleStreamEvent)

    const inputEngine = new InputEngine()
    inputEngineRef.current = inputEngine
    inputEngine.attach(canvas, (command) => {
      if (command.type === 'mouse-move') {
        const payload = command.payload as { dx?: number; dy?: number }
        if (typeof payload.dx === 'number' && typeof payload.dy === 'number') {
          moveCursor(payload.dx, payload.dy)
        }
      }
      streamEngine.sendInput(command)
    })

    return () => {
      inputEngine.detach()
      inputEngineRef.current = null
      streamEngine.disconnect()
      streamEngineRef.current = null
      setRemoteStream(null)
    }
  }, [hostUrl, moveCursor, setStatus, updateTelemetry])

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-canvas text-white">
      <StreamCanvas canvasRef={canvasRef} remoteStream={remoteStream} />
      <DynamicIslandHUD />
      <div className="pointer-events-none absolute inset-x-5 top-1/2 z-20 flex -translate-y-1/2 items-center justify-between">
        <ModifierRibbon />
        <ActionPod />
      </div>
      <FloatingDock />
    </main>
  )
}

export default StreamWorkspace
