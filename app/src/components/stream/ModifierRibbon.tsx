import { useInputStore } from '@/stores/input-store'
import type { ModifierKey } from '@/types'

const modifierButtons: Array<{ key: ModifierKey; label: string; symbol: string }> = [
  { key: 'Escape', label: 'Esc', symbol: '⎋' },
  { key: 'Tab', label: 'Tab', symbol: '⇥' },
  { key: 'Control', label: 'Ctrl', symbol: '⌃' },
  { key: 'Alt', label: 'Opt', symbol: '⌥' },
  { key: 'Meta', label: 'Cmd', symbol: '⌘' },
  { key: 'Shift', label: 'Shift', symbol: '⇧' },
  { key: 'F5', label: 'F5', symbol: 'F5' },
]

export function ModifierRibbon() {
  const { modifiers, toggleModifier } = useInputStore()

  return (
    <aside className="pointer-events-auto flex flex-col gap-1.5 rounded-[22px] bg-black/45 p-2 shadow-ios-glass backdrop-blur-2xl" aria-label="Modifier keys">
      {modifierButtons.map(({ key, label, symbol }) => {
        const state = modifiers[key]
        const active = state === 'latched' || state === 'locked'
        return (
          <button
            key={key}
            type="button"
            data-state={state}
            aria-label={label}
            aria-pressed={active}
            onClick={() => toggleModifier(key)}
            className={`relative flex h-11 w-12 flex-col items-center justify-center rounded-[13px] text-xs transition ${active ? 'bg-apple-blue font-bold text-white shadow-ios-glow' : 'bg-white/10 text-white/75 hover:bg-white/20'}`}
          >
            <span className="text-base leading-none">{symbol}</span>
            {symbol !== label && <span className="mt-0.5 text-[8px] opacity-70">{label}</span>}
            {state === 'locked' && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-apple-amber" />}
          </button>
        )
      })}
    </aside>
  )
}

export default ModifierRibbon
