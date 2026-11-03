import { useMemo, useState } from 'react'

import { Icon } from '@/components/shared/Icon'
import { useConnectionStore } from '@/stores/connection-store'
import type { AppCategory, RemoteApp } from '@/types'

const apps: RemoteApp[] = [
  { id: 'vscode', name: 'VS Code', icon: 'code', category: 'dev', status: 'active', subtitle: 'OmniDeck workspace' },
  { id: 'chrome', name: 'Chrome', icon: 'language', category: 'web', status: 'active', subtitle: '12 tabs' },
  { id: 'terminal', name: 'zsh Terminal', icon: 'terminal', category: 'dev', status: 'active', subtitle: '2 sessions' },
  { id: 'blender', name: 'Blender', icon: 'view_in_ar', category: 'creative', status: 'idle', subtitle: 'Scene ready' },
  { id: 'spotify', name: 'Spotify', icon: 'graphic_eq', category: 'media', status: 'active', subtitle: 'Get Lucky' },
  { id: 'steam', name: 'Steam', icon: 'sports_esports', category: 'gaming', status: 'idle', subtitle: 'Library' },
  { id: 'discord', name: 'Discord', icon: 'forum', category: 'media', status: 'idle', subtitle: '3 unread' },
  { id: 'docker', name: 'Docker', icon: 'deployed_code', category: 'dev', status: 'active', subtitle: '6 containers' },
]

const categoryOptions: Array<{ label: string; value: 'all' | AppCategory }> = [
  { label: 'All Apps', value: 'all' },
  { label: 'Dev', value: 'dev' },
  { label: 'Gaming', value: 'gaming' },
  { label: 'Media', value: 'media' },
]

const iconSurfaces: Record<string, string> = {
  vscode: 'bg-[#087fca]',
  chrome: 'bg-[#b83d32]',
  terminal: 'bg-[#282b35]',
  blender: 'bg-[#c75b05]',
  spotify: 'bg-[#16883b]',
  steam: 'bg-[#234e78]',
  discord: 'bg-[#5267c7]',
  docker: 'bg-[#087ca6]',
}

export default function AppLibrary() {
  const { hostConfig, setActiveView, toggleSettings } = useConnectionStore()
  const [category, setCategory] = useState<'all' | AppCategory>('all')
  const [query, setQuery] = useState('')

  const visibleApps = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return apps.filter((app) => {
      const inCategory = category === 'all' || app.category === category
      const matchesQuery = normalizedQuery === '' || app.name.toLowerCase().includes(normalizedQuery)
      return inCategory && matchesQuery
    })
  }, [category, query])

  const focusApp = () => setActiveView('stream')

  return (
    <main className="h-full w-full overflow-y-auto bg-canvas px-6 py-5 text-white no-scrollbar">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">App Library</h1>
          <p className="mt-1 text-sm text-white/50">Stage Manager on {hostConfig.name} · choose one window for the phone.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Open settings"
            onClick={toggleSettings}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
          >
            <Icon name="settings" size={20} />
          </button>
          <button
            type="button"
            onClick={() => setActiveView('stream')}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-black transition-transform active:scale-95"
          >
            <Icon name="arrow_back" size={18} />
            Back to Stream
          </button>
        </div>
      </header>

      <section className="ios-glass-subtle squircle-card p-4" aria-label="App library controls">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-black/25 p-1 no-scrollbar" role="group" aria-label="Filter apps by category">
            {categoryOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={category === option.value}
                onClick={() => setCategory(option.value)}
                className={`h-9 shrink-0 rounded-lg px-3 text-sm font-medium transition-colors ${
                  category === option.value ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="relative block sm:w-64">
            <span className="sr-only">Search apps</span>
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="search"
              aria-label="Search apps"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search apps"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/25 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-apple-blue"
            />
          </label>
        </div>
      </section>

      <section className="mt-4" aria-labelledby="stage-manager-apps">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="stage-manager-apps" className="text-base font-semibold">Stage Manager</h2>
          <span aria-live="polite" className="text-xs tabular-nums text-white/45">{visibleApps.length} apps</span>
        </div>

        {visibleApps.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {visibleApps.map((app) => (
              <article key={app.id} className="ios-glass-subtle rounded-[18px] p-4">
                <div className="flex items-start gap-3">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-[14px] ${iconSurfaces[app.id]}`}>
                    <Icon name={app.icon} size={26} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{app.name}</h3>
                        <p className="mt-0.5 truncate text-xs text-white/45">{app.subtitle}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        app.status === 'active' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-white/[0.07] text-white/45'
                      }`}>
                        {app.status === 'active' ? 'Active' : 'Idle'}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={focusApp}
                  aria-label={`Focus ${app.name} on Phone`}
                  className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-white/[0.09] text-xs font-semibold text-white/85 transition-colors hover:bg-white/[0.15] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-apple-blue"
                >
                  <Icon name="smartphone" size={17} />
                  Focus on Phone
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-white/15 px-4 py-8 text-center text-sm text-white/50">
            No apps match this filter.
          </div>
        )}
      </section>
    </main>
  )
}
