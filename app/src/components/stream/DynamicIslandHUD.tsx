import { Icon } from '@/components/shared/Icon'
import { useConnectionStore } from '@/stores/connection-store'
import { useInputStore } from '@/stores/input-store'
import { useTelemetryStore } from '@/stores/telemetry-store'
import type { InputMode } from '@/types'

const inputModes: Array<{ mode: InputMode; label: string; icon: string }> = [
  { mode: 'touch', label: 'Touch', icon: 'touch_app' },
  { mode: 'trackpad', label: 'Trackpad', icon: 'trackpad' },
  { mode: 'gamepad', label: 'Gamepad', icon: 'sports_esports' },
]

export interface DynamicIslandHUDProps {
  onReconnect?: () => void
  onDisconnect?: () => void
}

export function DynamicIslandHUD({ onReconnect, onDisconnect }: DynamicIslandHUDProps = {}) {
  const { fps, ping } = useTelemetryStore()
  const { inputMode, setInputMode } = useInputStore()
  const { status, hostConfig, setStatus, toggleSettings } = useConnectionStore()
  const connected = status === 'connected'

  const handleToggleConnection = () => {
    if (connected) {
      setStatus('disconnected')
      onDisconnect?.()
    } else {
      setStatus('connecting')
      onReconnect?.()
    }
  }

  return (
    <header className="pointer-events-auto absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/80 px-3 py-2 text-white shadow-ios-island backdrop-blur-2xl">
      <div className="flex items-center gap-2 px-2">
        <span className="relative flex h-2.5 w-2.5">
          {connected && <span className="absolute h-full w-full animate-ping rounded-full bg-apple-mint opacity-60" />}
          <span className={`relative h-2.5 w-2.5 rounded-full ${connected ? 'bg-apple-mint' : 'bg-apple-red'}`} />
        </span>
        <div className="leading-tight">
          <p className="text-xs font-semibold">{hostConfig.name}</p>
          <p className="text-[10px] text-white/55">{Math.round(fps)} FPS · {ping.toFixed(1)} ms</p>
        </div>
      </div>

      <div className="hidden items-center gap-1 lg:flex">
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium">HW Mouse</span>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium">Magic Keyboard</span>
      </div>

      <div className="flex rounded-full bg-white/10 p-1" aria-label="Input mode">
        {inputModes.map(({ mode, label, icon }) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={inputMode === mode}
            onClick={() => setInputMode(mode)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs transition ${inputMode === mode ? 'bg-apple-blue font-semibold' : 'text-white/65 hover:text-white'}`}
          >
            <Icon name={icon} size={16} />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        aria-label="Open settings"
        onClick={toggleSettings}
        className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/70 transition hover:bg-white/20 hover:text-white"
      >
        <Icon name="settings" size={18} />
      </button>

      <button
        type="button"
        aria-label={connected ? 'Disconnect' : 'Reconnect'}
        onClick={handleToggleConnection}
        className={`grid h-8 w-8 place-items-center rounded-full transition ${
          connected
            ? 'bg-apple-red/20 text-apple-red hover:bg-apple-red hover:text-white'
            : 'bg-apple-mint/20 text-apple-mint hover:bg-apple-mint hover:text-black'
        }`}
      >
        <Icon name={connected ? 'power_settings_new' : 'refresh'} size={18} />
      </button>
    </header>
  )
}

export default DynamicIslandHUD
