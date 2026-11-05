import { useEffect, useRef, type Ref } from 'react'
import { useInputStore } from '@/stores/input-store'

export interface StreamCanvasProps {
  canvasRef?: Ref<HTMLDivElement>
  remoteStream?: MediaStream | null
  frame?: Blob | null
  frameUrl?: string | null
}

const rustCode = `pub fn render_pipeline(frame: &mut Frame) {
    let encoder = gpu.create_encoder();
    let pass = encoder.begin_render_pass(&frame.view);

    pass.set_pipeline(&self.pipeline);
    pass.set_bind_group(0, &self.camera, &[]);
    pass.draw(0..3, 0..1);

    queue.submit(encoder.finish());
}`

export function StreamCanvas({ canvasRef, remoteStream, frame, frameUrl }: StreamCanvasProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const renderCanvasRef = useRef<HTMLCanvasElement>(null)
  const currentBitmapRef = useRef<ImageBitmap | null>(null)
  const cursor = useInputStore((state) => state.cursor)
  const hasMovedCursor = cursor.x > 0 || cursor.y > 0

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  useEffect(() => {
    let cancelled = false

    if (!frame) {
      if (currentBitmapRef.current) {
        currentBitmapRef.current.close()
        currentBitmapRef.current = null
      }
      return
    }

    if (typeof createImageBitmap === 'function') {
      createImageBitmap(frame)
        .then((bitmap) => {
          if (cancelled) {
            bitmap.close()
            return
          }

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

    return () => {
      cancelled = true
    }
  }, [frame])

  useEffect(() => {
    return () => {
      if (currentBitmapRef.current) {
        currentBitmapRef.current.close()
        currentBitmapRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 overflow-hidden bg-gradient-to-br from-[#111827] via-[#090d17] to-[#030407]"
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
        <>
          <div
            className="absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, transparent, transparent 3px, #fff 4px)',
            }}
          />
          <div className="absolute inset-6 top-24 grid grid-cols-[58%_1fr] gap-3 pb-28">
            <section className="overflow-hidden rounded-xl bg-[#0f1420] shadow-2xl">
              <div className="flex h-10 items-center gap-2 bg-[#171d2a] px-4 text-xs text-white/55">
                <span className="h-2.5 w-2.5 rounded-full bg-apple-red" />
                <span className="h-2.5 w-2.5 rounded-full bg-apple-amber" />
                <span className="h-2.5 w-2.5 rounded-full bg-apple-mint" />
                <span className="ml-3">pipeline_render.rs</span>
              </div>
              <div className="flex h-full">
                <div className="w-12 bg-[#0b101a] pt-5 text-right font-mono text-xs leading-6 text-white/20">
                  1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9<br />10<br />11
                </div>
                <pre className="m-0 p-5 font-mono text-[13px] leading-6 text-[#c7d2fe]">
                  <code>{rustCode}</code>
                </pre>
              </div>
            </section>
            <div className="flex min-w-0 flex-col gap-3">
              <section className="h-[52%] overflow-hidden rounded-xl bg-[#080b10] shadow-2xl">
                <div className="flex h-9 items-center px-4 text-xs text-white/45">Terminal — zsh</div>
                <pre className="p-4 font-mono text-xs leading-6 text-white/65">
                  <code>
                    <span className="text-apple-mint">titan@rig</span> ~/render $ cargo run --release{'\n'}
                    Compiling omnideck-render v0.8.4{'\n'}
                    Finished release [optimized] in 1.42s{'\n'}
                    GPU: RTX 4090 · Vulkan 1.3{'\n'}
                    Streaming frame 88421 @ 120 fps{'\n'}
                    Bitrate stable: 50.0 Mbps
                  </code>
                </pre>
              </section>
              <section className="relative h-[48%] overflow-hidden rounded-xl bg-[#171922] shadow-2xl">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,#334155_0%,#171922_55%,#090b10_100%)]" />
                <div className="absolute left-4 top-3 text-xs text-white/45">Blender · Scene Preview</div>
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rotate-12 rounded-2xl border border-orange-300/60 bg-orange-500/25 shadow-[0_0_45px_rgba(234,118,0,0.25)]" />
                <div className="absolute bottom-3 left-4 text-[10px] text-white/35">Rendered · 256 samples</div>
              </section>
            </div>
          </div>
        </>
      )}
      <div
        className="pointer-events-none absolute flex items-center gap-2 transition-transform duration-75"
        style={
          hasMovedCursor
            ? { left: cursor.x, top: cursor.y, transform: 'translate(-50%, -50%)' }
            : { left: '61%', top: '46%' }
        }
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
