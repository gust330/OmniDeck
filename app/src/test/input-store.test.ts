import { describe, it, expect, beforeEach } from 'vitest';
import { useInputStore } from '@/stores/input-store';

describe('useInputStore', () => {
  beforeEach(() => {
    useInputStore.getState().clearAllModifiers();
    useInputStore.setState({
      inputMode: 'touch',
      cursor: { x: 0, y: 0 },
      isPointerLocked: false,
      scroll: { velocity: 0, isScrolling: false },
      pressedKeys: new Set(),
      gamepad: { connected: false, id: '', axes: [], buttons: [] },
    });
  });

  describe('Modifier Latching & Locking', () => {
    it('cycles modifier state: inactive -> latched -> locked -> inactive', () => {
      const store = useInputStore.getState();
      expect(store.modifiers.Control).toBe('inactive');

      // 1. Single tap: latched
      store.toggleModifier('Control');
      expect(useInputStore.getState().modifiers.Control).toBe('latched');

      // 2. Double tap: locked
      store.toggleModifier('Control');
      expect(useInputStore.getState().modifiers.Control).toBe('locked');

      // 3. Third tap: cleared back to inactive
      store.toggleModifier('Control');
      expect(useInputStore.getState().modifiers.Control).toBe('inactive');
    });

    it('consumes only latched modifiers on remote action execution', () => {
      const store = useInputStore.getState();
      store.toggleModifier('Control'); // latched
      store.toggleModifier('Meta'); // latched
      store.toggleModifier('Meta'); // locked

      expect(useInputStore.getState().modifiers.Control).toBe('latched');
      expect(useInputStore.getState().modifiers.Meta).toBe('locked');

      const consumed = useInputStore.getState().consumeLatched();
      expect(consumed).toEqual(['Control']);

      // Latched is cleared; locked remains locked
      expect(useInputStore.getState().modifiers.Control).toBe('inactive');
      expect(useInputStore.getState().modifiers.Meta).toBe('locked');
    });

    it('clears specific and all modifiers', () => {
      const store = useInputStore.getState();
      store.toggleModifier('Alt');
      store.toggleModifier('Shift');
      expect(useInputStore.getState().modifiers.Alt).toBe('latched');
      expect(useInputStore.getState().modifiers.Shift).toBe('latched');

      store.clearModifier('Alt');
      expect(useInputStore.getState().modifiers.Alt).toBe('inactive');
      expect(useInputStore.getState().modifiers.Shift).toBe('latched');

      store.clearAllModifiers();
      expect(useInputStore.getState().modifiers.Shift).toBe('inactive');
    });
  });

  describe('Cursor Movement & Clamping', () => {
    it('moves cursor and clamps to screen bounds', () => {
      const store = useInputStore.getState();
      store.setCursor({ x: 100, y: 100 });
      expect(useInputStore.getState().cursor).toEqual({ x: 100, y: 100 });

      store.moveCursor(50, -30);
      expect(useInputStore.getState().cursor).toEqual({ x: 150, y: 70 });

      // Negative clamping
      store.moveCursor(-500, -500);
      expect(useInputStore.getState().cursor.x).toBe(0);
      expect(useInputStore.getState().cursor.y).toBe(0);
    });

    it('updates pointer lock state', () => {
      const store = useInputStore.getState();
      expect(store.isPointerLocked).toBe(false);

      store.setPointerLocked(true);
      expect(useInputStore.getState().isPointerLocked).toBe(true);
    });
  });

  describe('Input Mode Switching', () => {
    it('switches between touch, trackpad, and gamepad modes', () => {
      const store = useInputStore.getState();
      expect(store.inputMode).toBe('touch');

      store.setInputMode('trackpad');
      expect(useInputStore.getState().inputMode).toBe('trackpad');

      store.setInputMode('gamepad');
      expect(useInputStore.getState().inputMode).toBe('gamepad');
    });
  });

  describe('Touch Calibration & Settings Trigger', () => {
    it('updates touch calibration and settings trigger', () => {
      const store = useInputStore.getState();
      store.setTouchCalibration({ sensitivity: 135, deadZone: 7 });
      store.setSettingsTrigger('corner-swipe');

      expect(useInputStore.getState().touchCalibration).toEqual({ sensitivity: 135, deadZone: 7 });
      expect(useInputStore.getState().settingsTrigger).toBe('corner-swipe');
    });
  });

  describe('Keyboard Key Tracking', () => {
    it('tracks pressed keys as an immutable Set', () => {
      const store = useInputStore.getState();
      store.addPressedKey('KeyW');
      store.addPressedKey('Space');

      expect(useInputStore.getState().pressedKeys.has('KeyW')).toBe(true);
      expect(useInputStore.getState().pressedKeys.has('Space')).toBe(true);

      store.removePressedKey('KeyW');
      expect(useInputStore.getState().pressedKeys.has('KeyW')).toBe(false);
      expect(useInputStore.getState().pressedKeys.has('Space')).toBe(true);
    });
  });
});
