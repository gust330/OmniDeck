import { create } from 'zustand'

import type {
  ActiveView,
  AudioRoute,
  ConnectionStatus,
  HostConfig,
  StreamSettings,
} from '@/types'

interface ConnectionStore {
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void
  hostConfig: HostConfig
  setHostConfig: (hostConfig: Partial<HostConfig>) => void
  activeView: ActiveView
  setActiveView: (activeView: ActiveView) => void
  audioRoute: AudioRoute
  setAudioRoute: (audioRoute: AudioRoute) => void
  volume: number
  setVolume: (volume: number) => void
  brightness: number
  setBrightness: (brightness: number) => void
  singleWindowFocus: boolean
  toggleSingleWindowFocus: () => void
  streamSettings: StreamSettings
  setStreamSettings: (streamSettings: Partial<StreamSettings>) => void
  showSettings: boolean
  toggleSettings: () => void
}

export const getDefaultHostUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || 'localhost'
    return `http://${hostname}:8080`
  }
  return 'http://localhost:8080'
}

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value))

export const useConnectionStore = create<ConnectionStore>((set) => ({
  status: 'connecting',
  setStatus: (status) => set({ status }),
  hostConfig: {
    name: 'TITAN-RIG',
    url: getDefaultHostUrl(),
    resolution: '4K',
    bitrate: 50,
    codec: 'av1',
  },
  setHostConfig: (hostConfig) =>
    set((state) => ({ hostConfig: { ...state.hostConfig, ...hostConfig } })),
  activeView: 'stream',
  setActiveView: (activeView) => set({ activeView }),
  audioRoute: 'phone',
  setAudioRoute: (audioRoute) => set({ audioRoute }),
  volume: 75,
  setVolume: (volume) => set({ volume: clampPercentage(volume) }),
  brightness: 85,
  setBrightness: (brightness) =>
    set({ brightness: clampPercentage(brightness) }),
  singleWindowFocus: true,
  toggleSingleWindowFocus: () =>
    set((state) => ({ singleWindowFocus: !state.singleWindowFocus })),
  streamSettings: {
    resolution: '4K',
    bitrate: 50,
    codec: 'av1',
    fps: 120,
  },
  setStreamSettings: (streamSettings) =>
    set((state) => ({
      streamSettings: { ...state.streamSettings, ...streamSettings },
    })),
  showSettings: false,
  toggleSettings: () => set((state) => ({ showSettings: !state.showSettings })),
}))
