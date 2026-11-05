import { useEffect, useState } from 'react'

import { Icon } from '@/components/shared/Icon'
import { StreamEngine } from '@/engines/stream-engine'
import { useConnectionStore } from '@/stores/connection-store'

interface DiscoveredApp {
  id?: string
  name?: string
  icon?: string
}

const defaultGradients = [
  'from-[#1f9cf0] to-[#0066b8]',
  'from-[#3a3f52] to-[#252836]',
  'from-[#2a2d39] to-[#171922]',
  'from-[#ea7600] to-[#b35400]',
  'from-[#16883b] to-[#0f5c27]',
  'from-[#5267c7] to-[#3a4ba0]',
]

function getAppIcon(nameOrId: string, icon?: string): string {
  if (icon) return icon
  const lower = nameOrId.toLowerCase()
  if (lower.includes('code')) return 'code'
  if (lower.includes('chrome') || lower.includes('web') || lower.includes('browser')) return 'language'
  if (lower.includes('term') || lower.includes('bash') || lower.includes('zsh')) return 'terminal'
  if (lower.includes('game') || lower.includes('steam')) return 'sports_esports'
  return 'deployed_code'
}

export function FloatingDock() {
  const { hostConfig, setActiveView } = useConnectionStore()
  const [apps, setApps] = useState<Array<{ id: string; name: string; icon: string; gradient: string }>>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const engine = new StreamEngine()
    engine.configureEndpoint(hostConfig.url)
    void engine.listApps()
      .then((remoteApps) => {
        if (!active || !Array.isArray(remoteApps)) return
        const mapped = remoteApps.flatMap((item, index) => {
          const raw = item as DiscoveredApp
          if (!raw.id) return []
          const name = raw.name ?? raw.id
          return [{
            id: raw.id,
            name,
            icon: getAppIcon(name, raw.icon),
            gradient: defaultGradients[index % defaultGradients.length],
          }]
        })
        setApps(mapped)
      })
      .catch(() => {
        if (active) setApps([])
      })
    return () => {
      active = false
    }
  }, [hostConfig.url])

  const handleOpenApp = async (appId: string) => {
    const engine = new StreamEngine()
    engine.configureEndpoint(hostConfig.url)
    setError(null)
    try {
      await engine.openApp(appId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open application.')
    }
  }

  return (
    <div className="pointer-events-auto absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2">
      {error && (
        <div role="alert" className="rounded-full bg-apple-red/80 px-3 py-1 text-xs text-white backdrop-blur-md">
          {error}
        </div>
      )}
      <div className="hidden items-center gap-4 rounded-full bg-black/45 px-4 py-1.5 text-[10px] text-white/60 backdrop-blur-xl sm:flex">
        <span>Two-finger tap: <b className="text-white/90">Right Click</b></span>
        <span>Pinch: <b className="text-white/90">Smooth Zoom</b></span>
        <span>3-Finger: <b className="text-white/90">Mission Control</b></span>
      </div>
      <nav className="flex items-center gap-2 rounded-[28px] bg-black/55 p-2.5 shadow-ios-dock backdrop-blur-2xl" aria-label="Application dock">
        {apps.map((app) => (
          <button
            key={app.id}
            type="button"
            aria-label={`Open ${app.name}`}
            onClick={() => handleOpenApp(app.id)}
            className={`grid h-12 w-12 place-items-center rounded-[15px] bg-gradient-to-br ${app.gradient} transition hover:-translate-y-1`}
          >
            <Icon name={app.icon} size={25} />
          </button>
        ))}
        {apps.length > 0 && <div className="mx-1 h-9 w-px bg-white/15" />}
        <div className="flex h-12 min-w-[170px] items-center gap-2 rounded-[15px] bg-[#15251b] px-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#1db954] text-black"><Icon name="graphic_eq" size={20} /></span>
          <span className="min-w-0 flex-1 leading-tight"><b className="block truncate text-[11px]">Get Lucky</b><span className="block truncate text-[9px] text-white/50">Daft Punk</span></span>
          <button type="button" aria-label="Pause"><Icon name="pause" filled size={20} /></button>
        </div>
        <button type="button" aria-label="Open app library" onClick={() => setActiveView('app-library')} className="grid h-12 w-12 place-items-center rounded-[15px] bg-white/10 hover:bg-white/20"><Icon name="add" size={26} /></button>
      </nav>
    </div>
  )
}

export default FloatingDock
