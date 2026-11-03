import { useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

export function useCapacitorInit() {
  useEffect(() => {
    async function initMobileFeatures() {
      if (!Capacitor.isNativePlatform()) {
        return;
      }

      try {
        // 1. Lock screen orientation to landscape
        await ScreenOrientation.lock({
          orientation: 'landscape',
        });
      } catch (err) {
        console.warn('Orientation lock failed or unsupported:', err);
      }

      try {
        // 2. Hide or style status bar for immersive landscape
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.hide();
      } catch (err) {
        console.warn('StatusBar configuration failed:', err);
      }

      try {
        // 3. Configure keyboard behavior
        await Keyboard.setAccessoryBarVisible({ isVisible: false });
      } catch (err) {
        console.warn('Keyboard configuration failed:', err);
      }
    }

    initMobileFeatures();
  }, []);
}
