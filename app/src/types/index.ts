export type ModifierKey =
  | 'Escape'
  | 'Tab'
  | 'Control'
  | 'Alt'
  | 'Meta'
  | 'Shift'
  | 'F5'

export type ModifierState = 'inactive' | 'latched' | 'locked'

export type ModifierMap = Record<ModifierKey, ModifierState>

export type InputMode = 'touch' | 'trackpad' | 'gamepad'

export interface CursorPosition {
  x: number
  y: number
}

export interface ScrollState {
  velocity: number
  isScrolling: boolean
}

export interface TelemetryData {
  cpu: number
  gpu: number
  ram: number
  ramUsed: number
  ramTotal: number
  cpuTemp: number
  gpuTemp: number
  power: number
  bitrate: number
  ping: number
  fps: number
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

export interface HostConfig {
  name: string
  url: string
  resolution: '1080p' | '1440p' | '4K'
  bitrate: number
  codec: 'h264' | 'h265' | 'av1'
}

export type AppStatus = 'active' | 'idle'

export type AppCategory =
  | 'dev'
  | 'gaming'
  | 'media'
  | 'system'
  | 'web'
  | 'creative'

export interface RemoteApp {
  id: string
  name: string
  icon: string
  category: AppCategory
  status: AppStatus
  subtitle?: string
}

export interface WorkspacePreset {
  id: string
  name: string
  icon: string
  appCount: number
  bindCount: number
  isActive: boolean
  tag?: string
  description?: string
}

export type AudioRoute = 'rig' | 'phone'

export interface DockApp {
  id: string
  name: string
  icon: string
  isRunning: boolean
}

export interface StreamSettings {
  resolution: '1080p' | '1440p' | '4K'
  bitrate: number
  codec: 'h264' | 'h265' | 'av1'
  fps: 60 | 120
}

export type ActiveView =
  | 'stream'
  | 'control-center'
  | 'app-library'
  | 'dock-manager'
  | 'settings'

export interface GamepadState {
  connected: boolean
  id: string
  axes: number[]
  buttons: boolean[]
}

export interface TouchCalibration {
  sensitivity: number
  deadZone: number
}

export type SettingsTrigger =
  | 'hud-button'
  | 'three-finger-tap'
  | 'two-finger-double-tap'
  | 'corner-swipe'

