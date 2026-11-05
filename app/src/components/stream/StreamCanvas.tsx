import { useEffect, useRef, type Ref } from 'react'
import { useInputStore } from '@/stores/input-store'
import type { ConnectionStatus } from '@/types'

export interface StreamCanvasProps {
  canvasRef?: Ref<HTMLDivElement>
  remoteStream?: MediaStream | null
  frame?: Blob | null
  frameUrl?: string | null
  status?: ConnectionStatus
  error?: string | null
  hostName?: string
}

export function StreamCanvas({
  canvasRef,
  remoteStream,
  frame,
  frameUrl,
  status = 'connecting',
  error,
  hostName = 'host',
}: StreamCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const renderCanvasRef = useRef<HTMLCanvasElement>(null)
  const currentBitmapRef = useRef<ImageBitmap | null>(null)
  const decodeSeqRef = useRef(0)
  const lastDrawnSeqRef = useRef(0)
  const normalizedCursor = useInputStore((state) => state.normalizedCursor)

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  useEffect(() => {
    if (!frame) {
      if (currentBitmapRef.current) {
        currentBitmapRef.current.close()
        currentBitmapRef.current = null
      }
      return
    }

    const seq = ++decodeSeqRef.current

    if (typeof createImageBitmap === 'function') {
      createImageBitmap(frame)
        .then((bitmap) => {
          if (seq < lastDrawnSeqRef.current) {
            bitmap.close()
            return
          }
          lastDrawnSeqRef.current = seq

          if (currentBitmapRef.current) {
            currentBitmapRef.current.close()
          }
          currentBitmapRef.current = bitmap

          const canvas = renderCanvasRef.current
          if (canvas) {
            if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
              canvas.width = bitmap.width
              canvas.height = bitmap.height
            }
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.imageSmoothingEnabled = false
              ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height)
            }
          }
        })
        .catch(() => {
          // Ignore dropped/malformed frames
        })
    }
  }, [frame])

  useEffect(() => {
    return () => {
      lastDrawnSeqRef.current = Number.MAX_SAFE_INTEGER
      if (currentBitmapRef.current) {
        currentBitmapRef.current.close()
        currentBitmapRef.current = null
      }
    }
  }, [])

  const getPointerPosition = () => {
    const el = canvasRef && 'current' in canvasRef ? canvasRef.current : null
    const nx = normalizedCursor?.x ?? 0.5
    const ny = normalizedCursor?.y ?? 0.5
    if (!el) {
      return { left: `${nx * 100}%`, top: `${ny * 100}%` }
    }
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return { left: `${nx * 100}%`, top: `${ny * 100}%` }
    }
    const media = el.querySelector('canvas, video, img') as HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | null
    const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : media?.width
    const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : media?.height
    let left = 0
    let top = 0
    let width = rect.width
    let height = rect.height
    if (sourceWidth && sourceHeight && sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight)
      width = sourceWidth * scale
      height = sourceHeight * scale
      left = (rect.width - width) / 2
      top = (rect.height - height) / 2
    }
    const pointerX = left + nx * width
    const pointerY = top + ny * height
    return { left: `${pointerX}px`, top: `${pointerY}px` }
  }

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 cursor-none touch-none overflow-hidden bg-gradient-to-br from-[#111827] via-[#090d17] to-[#030407]"
      data-ui
    >
      {remoteStream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-testid="live-stream-video"
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : frame ? (
        <canvas
          ref={renderCanvasRef}
          data-testid="live-stream-canvas"
          className="absolute inset-0 h-full w-full object-contain select-none"
        />
      ) : frameUrl ? (
        <img
          src={frameUrl}
          alt="Live host desktop stream"
          data-testid="live-stream-frame"
          className="absolute inset-0 h-full w-full object-contain select-none"
        />
      ) : (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 grid place-items-center bg-[#05070b] text-center"
        >
          <div className="max-w-md px-8">
            <div className="mx-auto mb-4 h-10 w-10 rounded-full border-2 border-white/15 border-t-apple-blue animate-spin" />
            <p className="text-sm font-semibold text-white/90">
              {status === 'connecting' ? `Connecting to ${hostName}` : 'Host stream disconnected'}
            </p>
            <p className="mt-2 text-xs text-white/45">
              {error ?? (status === 'connecting' ? 'Waiting for the first live desktop frame…' : 'Use Reconnect to try again.')}
            </p>
          </div>
        </div>
      )}
      <div
        data-testid="hardware-cursor"
        className="pointer-events-none absolute flex items-center gap-2 transition-transform duration-75"
        style={{
          ...getPointerPosition(),
          transform: 'translate(-50%, -50%)',
        }}
      >
        <span className="h-5 w-5 rounded-full border-2 border-white bg-apple-blue shadow-[0_0_14px_rgba(10,132,255,.8)]" />
        <span className="rounded-full bg-black/65 px-2.5 py-1 text-[9px] text-white/75 backdrop-blur">
          Hardware Cursor 1000Hz
        </span>
      </div>
    </div>
  )
}

export default StreamCanvas
