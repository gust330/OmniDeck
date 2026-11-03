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

type TouchPoint = { x: number; y: number }

export class InputEngine {
  private element: HTMLElement | null = null
  private callback: InputCommandCallback | null = null
  private abortController: AbortController | null = null
  private gamepadAnimationFrame: number | null = null
  private touchStartPoints = new Map<number, TouchPoint>()
  private lastTouchPoints = new Map<number, TouchPoint>()
  private touchMoved = false
  private lastTapTime = 0

  attach(element: HTMLElement, callback: InputCommandCallback): void {
    this.detach()
    this.element = element
    this.callback = callback
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
    this.element = null
    this.callback = null
  }

  static calculatePointerDelta(
    movementX: number,
    movementY: number,
    sensitivity: number,
  ): { dx: number; dy: number } {
    return { dx: movementX * sensitivity, dy: movementY * sensitivity }
  }

  private emit(type: InputCommand['type'], payload: Record<string, unknown>): void {
    this.callback?.({ type, payload, timestamp: Date.now() })
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (shouldSuppressKey(event)) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.emit('key-down', {
      key: event.key,
      code: event.code,
      repeat: event.repeat,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    })
  }

  private handleKeyUp = (event: KeyboardEvent): void => {
    if (shouldSuppressKey(event)) {
      event.preventDefault()
      event.stopPropagation()
    }
    this.emit('key-up', {
      key: event.key,
      code: event.code,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    })
  }

  private handleClick = (): void => {
    if (document.pointerLockElement !== this.element) void this.element?.requestPointerLock()
  }

  private handlePointerLockChange = (): void => {
    // Pointer-lock state is read by the mousemove handler.
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (document.pointerLockElement !== this.element) return
    this.emit('mouse-move', { dx: event.movementX, dy: event.movementY })
  }

  private handleMouseDown = (event: MouseEvent): void => {
    this.emit('mouse-click', { button: event.button, pressed: true })
  }

  private handleMouseUp = (event: MouseEvent): void => {
    this.emit('mouse-click', { button: event.button, pressed: false })
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
    this.touchStartPoints.clear()
    this.lastTouchPoints.clear()
    for (const touch of Array.from(event.touches)) {
      const point = { x: touch.clientX, y: touch.clientY }
      this.touchStartPoints.set(touch.identifier, point)
      this.lastTouchPoints.set(touch.identifier, point)
    }
  }

  private handleTouchMove = (event: TouchEvent): void => {
    event.preventDefault()
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    const previous = this.lastTouchPoints.get(touch.identifier)
    if (!previous) return

    const dx = touch.clientX - previous.x
    const dy = touch.clientY - previous.y
    if (dx !== 0 || dy !== 0) {
      this.touchMoved = true
      this.emit('mouse-move', { dx, dy })
    }
    this.lastTouchPoints.set(touch.identifier, { x: touch.clientX, y: touch.clientY })
  }

  private handleTouchEnd = (event: TouchEvent): void => {
    event.preventDefault()
    if (event.touches.length > 0) return

    const fingerCount = this.touchStartPoints.size
    if (!this.touchMoved && fingerCount === 2) {
      this.emitTap(2, 1)
    } else if (!this.touchMoved && fingerCount === 1) {
      const now = Date.now()
      const clickCount = now - this.lastTapTime <= 300 ? 2 : 1
      this.lastTapTime = clickCount === 2 ? 0 : now
      this.emitTap(0, clickCount)
    }

    this.touchStartPoints.clear()
    this.lastTouchPoints.clear()
  }

  private emitTap(button: number, clickCount: number): void {
    this.emit('mouse-click', { button, pressed: true, clickCount })
    this.emit('mouse-click', { button, pressed: false, clickCount })
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
