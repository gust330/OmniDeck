import { useState } from 'react'
import { useConnectionStore } from '@/stores/connection-store'

interface IconProps {
  name: string
  className?: string
}

const Icon = ({ name, className = '' }: IconProps) => (
  <span className={`material-symbols-rounded ${className}`} aria-hidden="true">{name}</span>
)

const initialPresets = [
  { id: 'coding', name: 'Coding & DevOps', icon: 'code_blocks', appCount: 6, bindCount: 14 },
  { id: 'gaming', name: 'Gaming Rig', icon: 'sports_esports', appCount: 5, bindCount: 9 },
  { id: 'cinema', name: 'Cinema & Couch', icon: 'theaters', appCount: 4, bindCount: 6 },
  { id: 'studio', name: '3D Studio', icon: 'view_in_ar', appCount: 7, bindCount: 18 },
]

export default function DockManager() {
  const setActiveView = useConnectionStore((state) => state.setActiveView)
  const [activePreset, setActivePreset] = useState('coding')
  const [autoSwitch, setAutoSwitch] = useState(true)

  return (
    <main className="h-full w-full overflow-y-auto bg-canvas px-6 py-5 text-white no-scrollbar">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspace Presets</h1>
          <p className="mt-1 text-sm text-white/50">Load a dock, app set, and control bindings together.</p>
        </div>
        <button
          type="button"
          onClick={() => setActiveView('stream')}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-transform active:scale-95"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Back to Stream
        </button>
      </header>

      <section className="grid gap-3 md:grid-cols-2" aria-label="Workspace presets">
        {initialPresets.map((preset) => {
          const isActive = preset.id === activePreset
          return (
            <article
              key={preset.id}
              className={`squircle-card p-5 ring-1 ring-inset transition-shadow ${isActive ? 'bg-apple-teal/[0.08] ring-apple-teal shadow-[0_0_24px_rgba(100,210,255,0.18)]' : 'ios-glass-subtle ring-white/10'}`}
            >
              <div className="flex items-start gap-4">
                <Icon name={preset.icon} className={`text-[28px] ${isActive ? 'text-apple-teal' : 'text-white/55'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="truncate text-base font-semibold">{preset.name}</h2>
                    {isActive && <span className="rounded-full bg-apple-teal/15 px-2 py-1 text-[11px] font-medium text-apple-teal">Active</span>}
                  </div>
                  <p className="mt-1.5 text-sm tabular-nums text-white/50">{preset.appCount} apps · {preset.bindCount} binds</p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActivePreset(preset.id)}
                  disabled={isActive}
                  className={`h-9 rounded-xl text-sm font-semibold transition-transform active:scale-[0.98] ${isActive ? 'cursor-default bg-apple-teal text-black' : 'bg-white text-black'}`}
                >
                  {isActive ? 'Loaded' : 'Load'}
                </button>
                <button type="button" className="h-9 rounded-xl bg-white/[0.08] text-sm font-medium text-white/80 ring-1 ring-inset ring-white/10 hover:bg-white/[0.12]">
                  Edit
                </button>
              </div>
            </article>
          )
        })}
      </section>

      <section className="ios-glass-subtle squircle-card mt-4 flex items-center justify-between gap-5 p-5">
        <div className="flex items-start gap-3">
          <Icon name="usb" className="mt-0.5 text-[22px] text-white/55" />
          <div>
            <h2 className="text-base font-semibold">Auto-switch dock on peripheral hook</h2>
            <p className="mt-1 text-sm text-white/50">Load the matching preset when a known controller or dock connects.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={autoSwitch}
          aria-label="Auto-switch dock on peripheral hook"
          onClick={() => setAutoSwitch((enabled) => !enabled)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${autoSwitch ? 'bg-apple-mint' : 'bg-white/15'}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${autoSwitch ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </section>
    </main>
  )
}
