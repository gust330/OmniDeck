import { create } from 'zustand'

import type {
  CursorPosition,
  GamepadState,
  InputMode,
  ModifierKey,
  ModifierMap,
  ModifierState,
  ScrollState,
  SettingsTrigger,
  TouchCalibration,
} from '@/types'

const defaultModifiers: ModifierMap = {
  Escape: 'inactive',
  Tab: 'inactive',
  Control: 'inactive',
  Alt: 'inactive',
  Meta: 'inactive',
  Shift: 'inactive',
  F5: 'inactive',
}

const nextModifierState: Record<ModifierState, ModifierState> = {
  inactive: 'latched',
  latched: 'locked',
  locked: 'inactive',
}

interface InputStore {
  modifiers: ModifierMap
  toggleModifier: (key: ModifierKey) => void
  clearModifier: (key: ModifierKey) => void
  clearAllModifiers: () => void
  consumeLatched: () => ModifierKey[]
  inputMode: InputMode
  setInputMode: (inputMode: InputMode) => void
  cursor: CursorPosition
  setCursor: (cursor: CursorPosition) => void
  normalizedCursor: { x: number; y: number }
  setNormalizedCursor: (normalizedX: number, normalizedY: number) => void
  moveCursor: (dx: number, dy: number) => void
  isPointerLocked: boolean
  setPointerLocked: (isPointerLocked: boolean) => void
  scroll: ScrollState
  setScroll: (scroll: ScrollState) => void
  pressedKeys: Set<string>
  addPressedKey: (key: string) => void
  removePressedKey: (key: string) => void
  gamepad: GamepadState
  setGamepad: (gamepad: GamepadState) => void
  touchCalibration: TouchCalibration
  setTouchCalibration: (calibration: Partial<TouchCalibration>) => void
  settingsTrigger: SettingsTrigger
  setSettingsTrigger: (trigger: SettingsTrigger) => void
}

export const useInputStore = create<InputStore>((set, get) => ({
  modifiers: { ...defaultModifiers },
  toggleModifier: (key) =>
    set((state) => ({
      modifiers: {
        ...state.modifiers,
        [key]: nextModifierState[state.modifiers[key]],
      },
    })),
  clearModifier: (key) =>
    set((state) => ({
      modifiers: { ...state.modifiers, [key]: 'inactive' },
    })),
  clearAllModifiers: () => set({ modifiers: { ...defaultModifiers } }),
  consumeLatched: () => {
    const modifiers = get().modifiers
    const latchedKeys = (Object.keys(modifiers) as ModifierKey[]).filter(
      (key) => modifiers[key] === 'latched',
    )

    if (latchedKeys.length > 0) {
      set({
        modifiers: latchedKeys.reduce<ModifierMap>(
          (nextModifiers, key) => ({
            ...nextModifiers,
            [key]: 'inactive',
          }),
          modifiers,
        ),
      })
    }

    return latchedKeys
  },
  inputMode: 'touch',
  setInputMode: (inputMode) => set({ inputMode }),
  cursor: { x: 0, y: 0 },
  setCursor: (cursor) => set({ cursor }),
  normalizedCursor: { x: 0.5, y: 0.5 },
  setNormalizedCursor: (normalizedX, normalizedY) =>
    set({
      normalizedCursor: {
        x: Math.min(1, Math.max(0, normalizedX)),
        y: Math.min(1, Math.max(0, normalizedY)),
      },
    }),
  moveCursor: (dx, dy) =>
    set((state) => {
      const maxX = typeof window === 'undefined' ? Infinity : window.innerWidth
      const maxY = typeof window === 'undefined' ? Infinity : window.innerHeight
      const nextX = Math.min(maxX, Math.max(0, state.cursor.x + dx))
      const nextY = Math.min(maxY, Math.max(0, state.cursor.y + dy))
      const nx = maxX > 0 ? nextX / maxX : 0.5
      const ny = maxY > 0 ? nextY / maxY : 0.5

      return {
        cursor: {
          x: nextX,
          y: nextY,
        },
        normalizedCursor: {
          x: Math.min(1, Math.max(0, nx)),
          y: Math.min(1, Math.max(0, ny)),
        },
      }
    }),
  isPointerLocked: false,
  setPointerLocked: (isPointerLocked) => set({ isPointerLocked }),
  scroll: { velocity: 0, isScrolling: false },
  setScroll: (scroll) => set({ scroll }),
  pressedKeys: new Set<string>(),
  addPressedKey: (key) =>
    set((state) => ({ pressedKeys: new Set(state.pressedKeys).add(key) })),
  removePressedKey: (key) =>
    set((state) => {
      const pressedKeys = new Set(state.pressedKeys)
      pressedKeys.delete(key)
      return { pressedKeys }
    }),
  gamepad: { connected: false, id: '', axes: [], buttons: [] },
  setGamepad: (gamepad) => set({ gamepad }),
  touchCalibration: { sensitivity: 100, deadZone: 4 },
  setTouchCalibration: (calibration) =>
    set((state) => ({
      touchCalibration: { ...state.touchCalibration, ...calibration },
    })),
  settingsTrigger: 'hud-button',
  setSettingsTrigger: (settingsTrigger) => set({ settingsTrigger }),
}))
