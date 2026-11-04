import { describe, it, expect, beforeEach } from 'vitest';
import { useConnectionStore } from '@/stores/connection-store';

describe('useConnectionStore', () => {
  beforeEach(() => {
    useConnectionStore.setState({
      status: 'connected',
      activeView: 'stream',
      audioRoute: 'phone',
      volume: 75,
      brightness: 85,
      singleWindowFocus: true,
      showSettings: false,
    });
  });

  describe('View Navigation', () => {
    it('changes active view', () => {
      const store = useConnectionStore.getState();
      expect(store.activeView).toBe('stream');

      store.setActiveView('control-center');
      expect(useConnectionStore.getState().activeView).toBe('control-center');

      store.setActiveView('dock-manager');
      expect(useConnectionStore.getState().activeView).toBe('dock-manager');
    });
  });

  describe('Audio & Display Sliders', () => {
    it('clamps volume within 0-100', () => {
      const store = useConnectionStore.getState();
      store.setVolume(50);
      expect(useConnectionStore.getState().volume).toBe(50);

      store.setVolume(150);
      expect(useConnectionStore.getState().volume).toBe(100);

      store.setVolume(-20);
      expect(useConnectionStore.getState().volume).toBe(0);
    });

    it('clamps brightness within 0-100', () => {
      const store = useConnectionStore.getState();
      store.setBrightness(40);
      expect(useConnectionStore.getState().brightness).toBe(40);

      store.setBrightness(200);
      expect(useConnectionStore.getState().brightness).toBe(100);

      store.setBrightness(-10);
      expect(useConnectionStore.getState().brightness).toBe(0);
    });

    it('switches audio routing', () => {
      const store = useConnectionStore.getState();
      expect(store.audioRoute).toBe('phone');

      store.setAudioRoute('rig');
      expect(useConnectionStore.getState().audioRoute).toBe('rig');
    });

    it('toggles single window focus', () => {
      const store = useConnectionStore.getState();
      expect(store.singleWindowFocus).toBe(true);

      store.toggleSingleWindowFocus();
      expect(useConnectionStore.getState().singleWindowFocus).toBe(false);

      store.toggleSingleWindowFocus();
      expect(useConnectionStore.getState().singleWindowFocus).toBe(true);
    });
  });

  describe('Settings Modal & Configuration', () => {
    it('defaults to the plain HTTP server endpoint on port 8080', () => {
      expect(useConnectionStore.getState().hostConfig.url).toBe('http://192.168.1.100:8080')
    })

    it('toggles settings visibility', () => {
      const store = useConnectionStore.getState();
      expect(store.showSettings).toBe(false);

      store.toggleSettings();
      expect(useConnectionStore.getState().showSettings).toBe(true);

      store.toggleSettings();
      expect(useConnectionStore.getState().showSettings).toBe(false);
    });

    it('updates host config', () => {
      const store = useConnectionStore.getState();
      store.setHostConfig({ name: 'WORKSTATION-X', resolution: '1440p' });

      const updated = useConnectionStore.getState().hostConfig;
      expect(updated.name).toBe('WORKSTATION-X');
      expect(updated.resolution).toBe('1440p');
      expect(updated.codec).toBe('av1'); // Preserved
    });

    it('updates stream settings', () => {
      const store = useConnectionStore.getState();
      store.setStreamSettings({ bitrate: 80, fps: 60 });

      const updated = useConnectionStore.getState().streamSettings;
      expect(updated.bitrate).toBe(80);
      expect(updated.fps).toBe(60);
      expect(updated.codec).toBe('av1'); // Preserved
    });
  });
});
