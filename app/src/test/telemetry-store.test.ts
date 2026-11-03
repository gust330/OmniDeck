import { describe, it, expect, beforeEach } from 'vitest';
import { useTelemetryStore } from '@/stores/telemetry-store';

describe('useTelemetryStore', () => {
  beforeEach(() => {
    useTelemetryStore.getState().resetTelemetry();
  });

  it('initializes with default telemetry data', () => {
    const store = useTelemetryStore.getState();
    expect(store.cpu).toBe(24);
    expect(store.gpu).toBe(45);
    expect(store.ram).toBe(50);
    expect(store.ramUsed).toBe(32);
    expect(store.ramTotal).toBe(64);
    expect(store.cpuTemp).toBe(49);
    expect(store.gpuTemp).toBe(58);
    expect(store.power).toBe(285);
    expect(store.fps).toBe(120);
    expect(store.ping).toBe(2.1);
  });

  it('updates telemetry partially', () => {
    const store = useTelemetryStore.getState();
    store.updateTelemetry({ cpu: 78, gpuTemp: 72, ping: 1.5 });

    const updated = useTelemetryStore.getState();
    expect(updated.cpu).toBe(78);
    expect(updated.gpuTemp).toBe(72);
    expect(updated.ping).toBe(1.5);
    // Unchanged values persist
    expect(updated.ram).toBe(50);
    expect(updated.fps).toBe(120);
  });

  it('resets telemetry to defaults', () => {
    const store = useTelemetryStore.getState();
    store.updateTelemetry({ cpu: 99, fps: 30 });
    expect(useTelemetryStore.getState().cpu).toBe(99);

    store.resetTelemetry();
    expect(useTelemetryStore.getState().cpu).toBe(24);
    expect(useTelemetryStore.getState().fps).toBe(120);
  });
});
