import { Icon } from '@/components/shared/Icon'
import { useConnectionStore } from '@/stores/connection-store'

const dockApps = [
  { name: 'VS Code', icon: 'code', gradient: 'from-[#1f9cf0] to-[#0066b8]' },
  { name: 'Chrome', icon: 'language', gradient: 'from-[#3a3f52] to-[#252836]' },
  { name: 'Terminal', icon: 'terminal', gradient: 'from-[#2a2d39] to-[#171922]' },
  { name: 'Blender', icon: 'deployed_code', gradient: 'from-[#ea7600] to-[#b35400]' },
]

export function FloatingDock() {
  const setActiveView = useConnectionStore((state) => state.setActiveView)

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      <div className="hidden items-center gap-4 rounded-full bg-black/45 px-4 py-1.5 text-[10px] text-white/60 backdrop-blur-xl sm:flex">
        <span>Two-finger tap: <b className="text-white/90">Right Click</b></span>
        <span>Pinch: <b className="text-white/90">Smooth Zoom</b></span>
        <span>3-Finger: <b className="text-white/90">Mission Control</b></span>
      </div>
      <nav className="flex items-center gap-2 rounded-[28px] bg-black/55 p-2.5 shadow-ios-dock backdrop-blur-2xl" aria-label="Application dock">
        {dockApps.map((app) => (
          <button key={app.name} type="button" aria-label={app.name} className={`grid h-12 w-12 place-items-center rounded-[15px] bg-gradient-to-br ${app.gradient} transition hover:-translate-y-1`}>
            <Icon name={app.icon} size={25} />
          </button>
        ))}
        <div className="mx-1 h-9 w-px bg-white/15" />
        <div className="flex h-12 min-w-[170px] items-center gap-2 rounded-[15px] bg-[#15251b] px-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1db954] text-black"><Icon name="graphic_eq" size={20} /></span>
          <span className="min-w-0 flex-1 leading-tight"><b className="block truncate text-[11px]">Get Lucky</b><span className="block truncate text-[9px] text-white/50">Daft Punk</span></span>
          <button type="button" aria-label="Pause"><Icon name="pause" filled size={20} /></button>
        </div>
        <button type="button" aria-label="Steam" className="hidden h-12 w-12 place-items-center rounded-[15px] bg-[#193b62] sm:grid"><Icon name="sports_esports" size={24} /></button>
        <button type="button" aria-label="Open app library" onClick={() => setActiveView('app-library')} className="grid h-12 w-12 place-items-center rounded-[15px] bg-white/10 hover:bg-white/20"><Icon name="add" size={26} /></button>
      </nav>
    </div>
  )
}

export default FloatingDock
