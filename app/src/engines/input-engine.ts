export interface InputCommand {
  type:
    | 'mouse-move'
    | 'mouse-click'
    | 'mouse-scroll'
    | 'key-down'
    | 'key-up'
    | 'gamepad'
  payload: Record<string, unknown>
  timestamp: number
}

export type InputCommandCallback = (command: InputCommand) => void

type KeyboardModifierState = {
  Control?: 'inactive' | 'latched' | 'locked'
  Alt?: 'inactive' | 'latched' | 'locked'
  Meta?: 'inactive' | 'latched' | 'locked'
  Shift?: 'inactive' | 'latched' | 'locked'
}

type KeyboardModifierFlags = {
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

export const SUPPRESSED_KEYS = new Set([
  'Tab',
  'Escape',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'Meta',
  'ContextMenu',
])

type SuppressedCombo = {
  key: string
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export const SUPPRESSED_COMBOS: ReadonlyArray<SuppressedCombo> = [
  { key: 'w', ctrl: true },
  { key: 't', ctrl: true },
  { key: 'n', ctrl: true },
  { key: 'r', ctrl: true },
  { key: 'l', ctrl: true },
  { key: 'w', ctrl: true, shift: true },
  { key: 't', ctrl: true, shift: true },
  { key: 'n', ctrl: true, shift: true },
  { key: 'Tab', alt: true },
  { key: 'F4', alt: true },
  { key: 'w', meta: true },
  { key: 't', meta: true },
  { key: 'n', meta: true },
  { key: 'q', meta: true },
]

export function shouldSuppressKey(event: KeyboardEvent): boolean {
  if (SUPPRESSED_KEYS.has(event.key)) return true

  return SUPPRESSED_COMBOS.some(
    (combo) =>
      event.key.toLowerCase() === combo.key.toLowerCase() &&
      event.ctrlKey === Boolean(combo.ctrl) &&
      event.altKey === Boolean(combo.alt) &&
      event.shiftKey === Boolean(combo.shift) &&
      event.metaKey === Boolean(combo.meta),
  )
}

type TouchPoint = { x: number; y: number; normalizedX?: number; normalizedY?: number }

export class InputEngine {
  private element: HTMLElement | null = null
  private callback: InputCommandCallback | null = null
  private getModifierState: (() => KeyboardModifierState) | null = null
  private consumeModifiers: (() => unknown) | null = null
  private activeKeyboardModifiers = new Map<string, KeyboardModifierFlags>()
  private abortController: AbortController | null = null
  private gamepadAnimationFrame: number | null = null
  private touchStartPoints = new Map<number, TouchPoint>()
  private lastTouchPoints = new Map<number, TouchPoint>()
  private maxFingers = 0
  private touchMoved = false
  private normalizedCursor = { x: 0.5, y: 0.5 }
  private toggleOverlays: (() => void) | null = null

  attach(
    element: HTMLElement,
    callback: InputCommandCallback,
    getModifierState?: () => KeyboardModifierState,
    consumeModifiers?: () => unknown,
    toggleOverlays?: () => void,
  ): void {
    this.detach()
    this.element = element
    this.callback = callback
    this.getModifierState = getModifierState ?? null
    this.consumeModifiers = consumeModifiers ?? null
    this.toggleOverlays = toggleOverlays ?? null
    this.abortController = new AbortController()
    const options = { signal: this.abortController.signal }

    window.addEventListener('keydown', this.handleKeyDown, options)
    window.addEventListener('keyup', this.handleKeyUp, options)
    window.addEventListener('gamepadconnected', this.handleGamepadConnected, options)
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected, options)

    document.addEventListener('pointerlockchange', this.handlePointerLockChange, options)
    document.addEventListener('mousemove', this.handleMouseMove, options)

    element.addEventListener('click', this.handleClick, options)
    element.addEventListener('mousedown', this.handleMouseDown, options)
    element.addEventListener('mouseup', this.handleMouseUp, options)
    element.addEventListener('wheel', this.handleWheel, { ...options, passive: false })
    element.addEventListener('contextmenu', this.handleContextMenu, options)
    element.addEventListener('touchstart', this.handleTouchStart, { ...options, passive: false })
    element.addEventListener('touchmove', this.handleTouchMove, { ...options, passive: false })
    element.addEventListener('touchend', this.handleTouchEnd, { ...options, passive: false })
    element.addEventListener('touchcancel', this.handleTouchEnd, { ...options, passive: false })

    if (Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) this.startGamepadPolling()
  }

  detach(): void {
    this.abortController?.abort()
    this.abortController = null

    if (this.gamepadAnimationFrame !== null) {
      cancelAnimationFrame(this.gamepadAnimationFrame)
      this.gamepadAnimationFrame = null
    }

    if (document.pointerLockElement === this.element) void document.exitPointerLock()

    this.touchStartPoints.clear()
    this.lastTouchPoints.clear()
    this.activeKeyboardModifiers.clear()
    this.element = null
    this.callback = null
    this.getModifierState = null
    this.consumeModifiers = null
    this.toggleOverlays = null
  }

  rightClick(coords?: { normalizedX?: number; normalizedY?: number }): void {
    this.emitTap(2, 1, coords)
  }

  scroll(deltaY: number, deltaX = 0): void {
    this.emit('mouse-scroll', { deltaX, deltaY })
  }

  static calculatePointerDelta(
    movementX: number,
    movementY: number,
    sensitivity: number,
  ): { dx: number; dy: number } {
    return { dx: movementX * sensitivity, dy: movementY * sensitivity }
  }

  private normalizeCoordinates(clientX?: number, clientY?: number): { normalizedX?: number; normalizedY?: number } {
    if (!this.element || typeof clientX !== 'number' || typeof clientY !== 'number') return {}
    const rect = this.element.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return {}
    const media = this.element.querySelector('canvas, video, img') as HTMLCanvasElement | HTMLVideoElement | HTMLImageElement | null
    const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media instanceof HTMLImageElement ? media.naturalWidth : media?.width
    const sourceHeight = media instanceof HTMLVideoElement ? media.videoHeight : media instanceof HTMLImageElement ? media.naturalHeight : media?.height
    let left = rect.left, top = rect.top, width = rect.width, height = rect.height
    if (sourceWidth && sourceHeight) {
      const scale = Math.min(rect.width / sourceWidth, rect.height / sourceHeight)
      width = sourceWidth * scale
      height = sourceHeight * scale
      left += (rect.width - width) / 2
      top += (rect.height - height) / 2
    }
    const normalizedX = Math.min(1, Math.max(0, (clientX - left) / width))
    const normalizedY = Math.min(1, Math.max(0, (clientY - top) / height))
    return { normalizedX, normalizedY }
  }

  private emit(type: InputCommand['type'], payload: Record<string, unknown>): void {
    this.callback?.({ type, payload, timestamp: Date.now() })
  }

  private resolveModifierFlags(event: KeyboardEvent): KeyboardModifierFlags {
    const activeModifiers = this.getModifierState?.()
    const isModifierActive = (state?: 'inactive' | 'latched' | 'locked') =>
      state === 'latched' || state === 'locked'

    return {
      ctrlKey: Boolean(event.ctrlKey || isModifierActive(activeModifiers?.Control)),
      altKey: Boolean(event.altKey || isModifierActive(activeModifiers?.Alt)),
      shiftKey: Boolean(event.shiftKey || isModifierActive(activeModifiers?.Shift)),
      metaKey: Boolean(event.metaKey || isModifierActive(activeModifiers?.Meta)),
    }
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const modifierFlags = this.resolveModifierFlags(event)
    const keyIdentifier = event.code || event.key
    this.activeKeyboardModifiers.set(keyIdentifier, modifierFlags)

    const effectiveEvent = {
      key: event.key,
      ctrlKey: modifierFlags.ctrlKey,
      altKey: modifierFlags.altKey,
      shiftKey: modifierFlags.shiftKey,
      metaKey: modifierFlags.metaKey,
    } as KeyboardEvent

    if (shouldSuppressKey(effectiveEvent)) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.emit('key-down', {
      key: event.key,
      code: event.code,
      repeat: event.repeat,
      ...modifierFlags,
    })
    this.consumeModifiers?.()
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    const keyIdentifier = event.code || event.key
    const modifierFlags = this.activeKeyboardModifiers.get(keyIdentifier) ?? this.resolveModifierFlags(event)
    this.activeKeyboardModifiers.delete(keyIdentifier)

    const effectiveEvent = {
      key: event.key,
      ctrlKey: modifierFlags.ctrlKey,
      altKey: modifierFlags.altKey,
      shiftKey: modifierFlags.shiftKey,
      metaKey: modifierFlags.metaKey,
    } as KeyboardEvent

    if (shouldSuppressKey(effectiveEvent)) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.emit('key-up', {
      key: event.key,
      code: event.code,
      ...modifierFlags,
    })
  }

  private handleClick = (): void => {
    if (document.pointerLockElement !== this.element) void this.element?.requestPointerLock()
  }

  private handlePointerLockChange = (): void => {
    // Pointer-lock state is read by the mousemove handler.
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.element || !this.element) return
    const rect = this.element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    this.normalizedCursor.x = Math.min(1, Math.max(0, this.normalizedCursor.x + event.movementX / rect.width))
    this.normalizedCursor.y = Math.min(1, Math.max(0, this.normalizedCursor.y + event.movementY / rect.height))
    this.emit('mouse-move', { normalizedX: this.normalizedCursor.x, normalizedY: this.normalizedCursor.y })
  }

  private handleMouseDown = (event: MouseEvent): void => {
    const coords = this.normalizeCoordinates(event.clientX, event.clientY)
    this.emit('mouse-click', { button: event.button, pressed: true, ...coords })
  }

  private handleMouseUp = (event: MouseEvent): void => {
    const coords = this.normalizeCoordinates(event.clientX, event.clientY)
    this.emit('mouse-click', { button: event.button, pressed: false, ...coords })
  }

  private handleWheel = (event: WheelEvent): void => {
    event.preventDefault()
    this.emit('mouse-scroll', { deltaX: event.deltaX, deltaY: event.deltaY })
  }

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  private handleTouchStart = (event: TouchEvent): void => {
    event.preventDefault()
    this.touchMoved = false
    this.maxFingers = event.touches.length
    this.touchStartPoints.clear()
    this.lastTouchPoints.clear()
    for (const touch of Array.from(event.touches)) {
      const coords = this.normalizeCoordinates(touch.clientX, touch.clientY)
      const point = { x: touch.clientX, y: touch.clientY, ...coords }
      this.touchStartPoints.set(touch.identifier, point)
      this.lastTouchPoints.set(touch.identifier, point)
    }
    if (event.touches.length === 1) {
      const point = this.touchStartPoints.values().next().value as TouchPoint
      if (typeof point.normalizedX === 'number' && typeof point.normalizedY === 'number') {
        this.normalizedCursor = { x: point.normalizedX, y: point.normalizedY }
        this.emit('mouse-move', { normalizedX: point.normalizedX, normalizedY: point.normalizedY })
      }
    }
  }

  private handleTouchMove = (event: TouchEvent): void => {
    event.preventDefault()
    if (this.maxFingers >= 3) return
    if (event.touches.length === 2) {
      const deltas = Array.from(event.touches).map((touch) => {
        const previous = this.lastTouchPoints.get(touch.identifier)
        return previous ? { x: touch.clientX - previous.x, y: touch.clientY - previous.y } : { x: 0, y: 0 }
      })
      const deltaX = deltas.reduce((sum, point) => sum + point.x, 0) / 2
      const deltaY = deltas.reduce((sum, point) => sum + point.y, 0) / 2
      if (deltaX !== 0 || deltaY !== 0) {
        this.touchMoved = true
        this.emit('mouse-scroll', { deltaX, deltaY })
      }
    } else if (event.touches.length === 1) {
      const touch = event.touches[0]
      const previous = this.lastTouchPoints.get(touch.identifier)
      if (!previous) return
      const coords = this.normalizeCoordinates(touch.clientX, touch.clientY)
      if (touch.clientX !== previous.x || touch.clientY !== previous.y) {
        this.touchMoved = true
        if (typeof coords.normalizedX === 'number' && typeof coords.normalizedY === 'number') {
          this.normalizedCursor = { x: coords.normalizedX, y: coords.normalizedY }
        }
        this.emit('mouse-move', coords)
      }
    }
    for (const touch of Array.from(event.touches)) {
      this.lastTouchPoints.set(touch.identifier, { x: touch.clientX, y: touch.clientY, ...this.normalizeCoordinates(touch.clientX, touch.clientY) })
    }
  }

  private handleTouchEnd = (event: TouchEvent): void => {
    event.preventDefault()
    if (event.touches.length > 0) return

    const fingerCount = this.maxFingers
    const points = Array.from(this.touchStartPoints.values())
    const average = points.length > 0 ? {
      x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    } : null
    const coords = average ? this.normalizeCoordinates(average.x, average.y) : undefined

    if (!this.touchMoved && fingerCount === 3) {
      this.toggleOverlays?.()
    } else if (!this.touchMoved && fingerCount === 2) {
      this.emitTap(2, 1, coords)
    } else if (!this.touchMoved && fingerCount === 1) {
      if (coords && typeof coords.normalizedX === 'number' && typeof coords.normalizedY === 'number') {
        this.normalizedCursor = { x: coords.normalizedX, y: coords.normalizedY }
        this.emit('mouse-move', coords)
      }
      this.emitTap(0, 1, coords)
    }

    this.touchStartPoints.clear()
    this.lastTouchPoints.clear()
    this.maxFingers = 0
  }

  private emitTap(button: number, clickCount: number, coords?: { normalizedX?: number; normalizedY?: number }): void {
    this.emit('mouse-click', { button, pressed: true, clickCount, ...(coords ?? {}) })
    this.emit('mouse-click', { button, pressed: false, clickCount, ...(coords ?? {}) })
  }

  private handleGamepadConnected = (): void => this.startGamepadPolling()

  private handleGamepadDisconnected = (): void => {
    if (!Array.from(navigator.getGamepads?.() ?? []).some(Boolean)) {
      if (this.gamepadAnimationFrame !== null) cancelAnimationFrame(this.gamepadAnimationFrame)
      this.gamepadAnimationFrame = null
    }
  }

  private startGamepadPolling(): void {
    if (this.gamepadAnimationFrame !== null) return

    const poll = (): void => {
      for (const gamepad of Array.from(navigator.getGamepads?.() ?? [])) {
        if (!gamepad) continue
        this.emit('gamepad', {
          index: gamepad.index,
          id: gamepad.id,
          axes: Array.from(gamepad.axes),
          buttons: gamepad.buttons.map(({ pressed, value }) => ({ pressed, value })),
        })
      }
      this.gamepadAnimationFrame = requestAnimationFrame(poll)
    }

    this.gamepadAnimationFrame = requestAnimationFrame(poll)
  }
}
