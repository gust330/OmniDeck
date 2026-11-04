import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'

import { Icon } from '@/components/shared/Icon'
import { useConnectionStore } from '@/stores/connection-store'
import { useInputStore } from '@/stores/input-store'

export interface ActionPodProps {
  onRightClick?: () => void
  onScroll?: (deltaY: number) => void
}

export function ActionPod({ onRightClick, onScroll }: ActionPodProps = {}) {
  const setScroll = useInputStore((state) => state.setScroll)
  const setActiveView = useConnectionStore((state) => state.setActiveView)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [sliderPosition, setSliderPosition] = useState(50)
  const sliderRef = useRef<HTMLDivElement>(null)
  const onScrollRef = useRef(onScroll)
  onScrollRef.current = onScroll
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearScrollTimer = () => {
    if (scrollTimerRef.current !== null) {
      clearInterval(scrollTimerRef.current)
      scrollTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => clearScrollTimer()
  }, [])

  const handleRightClick = async () => {
    onRightClick?.()
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Light })
      } catch {
        // Safe fallback in test or unsupported environments
      }
    }
  }

  const handleToggleKeyboard = async () => {
    const nextState = !keyboardOpen
    setKeyboardOpen(nextState)
    if (Capacitor.isNativePlatform()) {
      try {
        if (nextState) {
          await Keyboard.show()
        } else {
          await Keyboard.hide()
        }
      } catch {
        // Safe fallback in test or unsupported environments
      }
    }
  }

  const updateScroll = (clientY: number) => {
    const bounds = sliderRef.current?.getBoundingClientRect()
    const height = bounds && bounds.height > 0 ? bounds.height : 112
    const top = bounds ? bounds.top : 0
    const rawPos = ((clientY - top) / height) * 100
    const position = Math.min(100, Math.max(0, Number.isFinite(rawPos) ? rawPos : 50))
    setSliderPosition(position)
    const velocity = Math.round((position - 50) * 2)
    const isScrolling = velocity !== 0
    setScroll({ velocity, isScrolling })

    clearScrollTimer()
    if (isScrolling) {
      onScrollRef.current?.(velocity)
      scrollTimerRef.current = setInterval(() => {
        onScrollRef.current?.(velocity)
      }, 80)
    }
  }

  const stopScroll = (event: React.PointerEvent<HTMLDivElement>) => {
    clearScrollTimer()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    setSliderPosition(50)
    setScroll({ velocity: 0, isScrolling: false })
  }

  return (
    <aside className="pointer-events-auto flex w-[68px] flex-col items-center gap-2 rounded-[28px] bg-black/45 p-2 shadow-ios-glass backdrop-blur-2xl" aria-label="Stream actions">
      <button type="button" onClick={handleRightClick} className="flex h-14 w-full flex-col items-center justify-center rounded-[18px] bg-white/10 text-[9px] text-white/75 hover:bg-white/20" aria-label="Right Click">
        <Icon name="ads_click" size={22} />
        <span>R-Click</span>
      </button>

      <div
        ref={sliderRef}
        role="slider"
        aria-label="Scroll velocity"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={Math.round((sliderPosition - 50) * 2)}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId)
          updateScroll(event.clientY)
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture || event.currentTarget.hasPointerCapture(event.pointerId)) {
            updateScroll(event.clientY)
          }
        }}
        onPointerUp={stopScroll}
        onPointerCancel={stopScroll}
        className="relative h-28 w-8 touch-none rounded-full bg-white/10"
      >
        <div className="absolute left-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md" style={{ top: `${sliderPosition}%` }} />
        <Icon name="keyboard_arrow_up" size={15} className="absolute left-1/2 top-1 -translate-x-1/2 text-white/35" />
        <Icon name="keyboard_arrow_down" size={15} className="absolute bottom-1 left-1/2 -translate-x-1/2 text-white/35" />
      </div>

      <button
        type="button"
        aria-label="Toggle Keyboard"
        aria-pressed={keyboardOpen}
        onClick={handleToggleKeyboard}
        className={`grid h-11 w-full place-items-center rounded-[16px] ${keyboardOpen ? 'bg-apple-blue' : 'bg-white/10 hover:bg-white/20'}`}
      >
        <Icon name="keyboard" size={22} />
      </button>
      <button type="button" aria-label="Exposé" onClick={() => setActiveView('app-library')} className="flex h-12 w-full flex-col items-center justify-center rounded-[16px] bg-white/10 text-[9px] text-white/75 hover:bg-white/20">
        <Icon name="view_quilt" size={21} />
        <span>Expose</span>
      </button>
    </aside>
  )
}

export default ActionPod
