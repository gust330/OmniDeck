import { useConnectionStore } from '@/stores/connection-store'
import { useTelemetryStore } from '@/stores/telemetry-store'

interface IconProps {
  name: string
  className?: string
}

const Icon = ({ name, className = '' }: IconProps) => (
  <span className={`material-symbols-rounded ${className}`} aria-hidden="true">
    {name}
  </span>
)

const apps = [
  { name: 'VS Code', icon: 'code', status: 'Active', gradient: 'from-sky-500 to-blue-700' },
  { name: 'Chrome', icon: 'language', status: 'Active', gradient: 'from-red-500 via-amber-400 to-emerald-500' },
  { name: 'zsh Terminal', icon: 'terminal', status: 'Active', gradient: 'from-zinc-500 to-zinc-950' },
  { name: 'Blender', icon: 'view_in_ar', status: 'Idle', gradient: 'from-orange-400 to-orange-700' },
  { name: 'Spotify', icon: 'graphic_eq', status: 'Active', gradient: 'from-emerald-400 to-green-700' },
  { name: 'Steam', icon: 'sports_esports', status: 'Idle', gradient: 'from-slate-400 to-slate-800' },
  { name: 'Discord', icon: 'forum', status: 'Idle', gradient: 'from-blue-400 to-indigo-600' },
  { name: 'Docker', icon: 'deployed_code', status: 'Active', gradient: 'from-cyan-400 to-blue-600' },
] as const

const telemetryRings = [
  { key: 'cpu', label: 'CPU', radius: 40, color: '#0A84FF' },
  { key: 'gpu', label: 'GPU', radius: 30, color: '#30D158' },
  { key: 'ram', label: 'RAM', radius: 20, color: '#BF5AF2' },
] as const

function VerticalSlider({
  label,
  icon,
  value,
  onChange,
}: {
  label: string
  icon: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
      <div className="relative h-44 w-16 overflow-hidden rounded-[22px] bg-white/10 ring-1 ring-inset ring-white/10">
        <div
          className="absolute inset-x-0 bottom-0 bg-white/85 transition-[height] duration-200"
          style={{ height: `${value}%` }}
        />
        <input
          aria-label={label}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          type="range"
          min="0"
          max="100"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
        />
        <div className={`pointer-events-none absolute inset-x-0 flex justify-center ${value > 18 ? 'bottom-4 text-black' : 'bottom-4 text-white/70'}`}>
          <Icon name={icon} className="text-[22px]" />
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="mt-0.5 text-xs tabular-nums text-white/55">{value}%</p>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-apple-mint' : 'bg-white/15'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  )
}

export default function ControlCenter() {
  const { cpu, gpu, ram } = useTelemetryStore()
  const {
    hostConfig,
    status,
    volume,
    brightness,
    setVolume,
    setBrightness,
    audioRoute,
    setAudioRoute,
    singleWindowFocus,
    toggleSingleWindowFocus,
    setActiveView,
    toggleSettings,
  } = useConnectionStore()
  const telemetry = { cpu, gpu, ram }

  return (
    <main className="h-full w-full overflow-y-auto bg-canvas px-6 py-5 text-white no-scrollbar">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Control Center</h1>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs text-white/70 ring-1 ring-inset ring-white/10">
            <span className={`h-2 w-2 rounded-full ${status === 'connected' ? 'bg-apple-mint' : 'bg-apple-red'}`} />
            <span>{hostConfig.name}</span>
            <span className="text-white/30">•</span>
            <span>{hostConfig.resolution} · {hostConfig.bitrate} Mbps</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Open settings"
            onClick={toggleSettings}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <Icon name="settings" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('stream')}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-transform active:scale-95"
          >
            <Icon name="arrow_back" className="text-[18px]" />
            Back to Stream
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <section className="space-y-4 xl:col-span-5" aria-label="System controls">
          <div className="ios-glass-subtle squircle-card grid gap-5 p-5 sm:grid-cols-[190px_1fr]">
            <div className="flex gap-4">
              <VerticalSlider label="Volume" icon="volume_up" value={volume} onChange={setVolume} />
              <VerticalSlider label="Rig HDR Brightness" icon="light_mode" value={brightness} onChange={setBrightness} />
            </div>

            <div className="flex flex-col items-center justify-center">
              <div className="relative h-52 w-52">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-label={`CPU ${cpu}%, GPU ${gpu}%, RAM ${ram}%`}>
                  {telemetryRings.map(({ key, radius, color }) => {
                    const circumference = 2 * Math.PI * radius
                    const value = telemetry[key]
                    return (
                      <g key={key}>
                        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
                        <circle
                          cx="50"
                          cy="50"
                          r={radius}
                          fill="none"
                          stroke={color}
                          strokeLinecap="round"
                          strokeWidth="5"
                          strokeDasharray={circumference}
                          strokeDashoffset={circumference * (1 - value / 100)}
                        />
                      </g>
                    )
                  })}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-semibold tabular-nums">{cpu}%</span>
                  <span className="text-xs text-white/50">CPU load</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs text-white/65">
                {telemetryRings.map(({ key, label, color }) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                    {label} <span className="tabular-nums text-white">{telemetry[key]}%</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="ios-glass-subtle squircle-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="speaker_group" className="text-[20px] text-white/60" />
              <h2 className="text-base font-semibold">Audio routing</h2>
            </div>
            <div className="grid grid-cols-2 rounded-xl bg-black/25 p-1">
              {([
                ['rig', 'Studio Rig'],
                ['phone', 'iPhone Audio'],
              ] as const).map(([route, label]) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => setAudioRoute(route)}
                  className={`h-9 rounded-lg text-sm font-medium transition-colors ${audioRoute === route ? 'bg-white text-black' : 'text-white/60 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="ios-glass-subtle squircle-card flex items-center justify-between gap-4 p-5">
            <div>
              <h2 className="text-base font-semibold">Single Window Focus</h2>
              <p className="mt-1 text-sm text-white/50">Keep the selected app isolated on your phone.</p>
            </div>
            <Toggle checked={singleWindowFocus} onChange={toggleSingleWindowFocus} label="Single Window Focus" />
          </div>
        </section>

        <section className="ios-glass-subtle squircle-card p-5 xl:col-span-7" aria-labelledby="stage-manager-title">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <h2 id="stage-manager-title" className="text-lg font-semibold">Stage Manager</h2>
              <p className="mt-1 text-sm text-white/50">Choose which desktop app takes over the phone.</p>
            </div>
            <span className="text-xs tabular-nums text-white/45">8 apps</span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {apps.map((app) => (
              <article key={app.name} className="rounded-2xl bg-white/[0.055] p-4 ring-1 ring-inset ring-white/[0.08]">
                <div className="flex items-start gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${app.gradient}`}>
                    <Icon name={app.icon} className="text-[24px] text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold">{app.name}</h3>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${app.status === 'Active' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.07] text-white/45'}`}>
                        {app.status}
                      </span>
                    </div>
                    <button type="button" className="mt-3 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-white/[0.08] text-xs font-medium text-white/80 transition-colors hover:bg-white/[0.13]">
                      <Icon name="smartphone" className="text-[16px]" />
                      Focus on Phone
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
