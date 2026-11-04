import { create } from 'zustand'

import type { TelemetryData } from '@/types'

const defaultTelemetry: TelemetryData = {
  cpu: 24,
  gpu: 45,
  ram: 50,
  ramUsed: 32,
  ramTotal: 64,
  cpuTemp: 49,
  gpuTemp: 58,
  power: 285,
  bitrate: 50,
  ping: 2.1,
  fps: 120,
}

interface TelemetryStore extends TelemetryData {
  updateTelemetry: (telemetry: Partial<TelemetryData>) => void
  resetTelemetry: () => void
}

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  ...defaultTelemetry,
  updateTelemetry: (telemetry) =>
    set((state) => ({
      ...telemetry,
      gpu: telemetry.gpu !== undefined ? telemetry.gpu : (state.gpu === defaultTelemetry.gpu ? 0 : state.gpu),
    })),
  resetTelemetry: () => set(defaultTelemetry),
}))
