import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  InputEngine,
  shouldSuppressKey,
  SUPPRESSED_KEYS,
  SUPPRESSED_COMBOS,
  type InputCommand,
} from '@/engines/input-engine';

describe('InputEngine', () => {
  describe('calculatePointerDelta', () => {
    it('scales pointer delta accurately with sensitivity', () => {
      expect(InputEngine.calculatePointerDelta(10, -5, 1.0)).toEqual({ dx: 10, dy: -5 });
      expect(InputEngine.calculatePointerDelta(10, -5, 1.5)).toEqual({ dx: 15, dy: -7.5 });
      expect(InputEngine.calculatePointerDelta(10, -5, 0.5)).toEqual({ dx: 5, dy: -2.5 });
    });
  });

  describe('shouldSuppressKey (Desktop Shortcut Interception)', () => {
    it('suppresses all standalone function keys (F1-F12), Tab, Escape, Meta', () => {
      const keys = ['Tab', 'Escape', 'Meta', 'ContextMenu', 'F1', 'F5', 'F11', 'F12'];
      for (const key of keys) {
        const event = new KeyboardEvent('keydown', { key });
        expect(shouldSuppressKey(event)).toBe(true);
      }
    });

    it('suppresses dangerous browser closing/tab combos (Ctrl+W, Ctrl+T, Alt+Tab, Alt+F4)', () => {
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'W', ctrlKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 't', ctrlKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'Tab', altKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'F4', altKey: true }))).toBe(true);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'q', metaKey: true }))).toBe(true);
    });

    it('allows normal typing keys through without suppression', () => {
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: '1' }))).toBe(false);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'Backspace' }))).toBe(false);
      expect(shouldSuppressKey(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(false);
    });
  });

  describe('InputEngine Lifecycle & Event Handling', () => {
    let engine: InputEngine;
    let container: HTMLDivElement;
    let commands: InputCommand[];

    beforeEach(() => {
      engine = new InputEngine();
      container = document.createElement('div');
      document.body.appendChild(container);
      commands = [];
    });

    afterEach(() => {
      engine.detach();
      container.remove();
    });

    it('attaches and detaches cleanly without leaking listeners', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      // Trigger keydown
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
      expect(commands.length).toBe(1);
      expect(commands[0].type).toBe('key-down');

      // Detach and verify no further events
      engine.detach();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', code: 'KeyB' }));
      expect(commands.length).toBe(1);
    });

    it('suppresses and prevents default on desktop shortcut keys', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
      const stopPropagationSpy = vi.spyOn(event, 'stopPropagation');

      window.dispatchEvent(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(stopPropagationSpy).toHaveBeenCalled();
      expect(commands.length).toBe(1);
      expect(commands[0].payload.key).toBe('Tab');
    });

    it('handles mouse click down and up', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      container.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      container.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));

      expect(commands.length).toBe(2);
      expect(commands[0]).toMatchObject({
        type: 'mouse-click',
        payload: { button: 0, pressed: true },
      });
      expect(commands[1]).toMatchObject({
        type: 'mouse-click',
        payload: { button: 0, pressed: false },
      });
    });

    it('handles mouse wheel scrolling with preventDefault', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      const wheelEvent = new WheelEvent('wheel', {
        deltaX: 0,
        deltaY: 120,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');

      container.dispatchEvent(wheelEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(commands.length).toBe(1);
      expect(commands[0]).toMatchObject({
        type: 'mouse-scroll',
        payload: { deltaX: 0, deltaY: 120 },
      });
    });

    it('handles touch gestures: 2-finger tap emits right click', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      const createTouch = (id: number, x: number, y: number) =>
        ({ identifier: id, clientX: x, clientY: y } as Touch);

      // TouchStart with 2 fingers
      container.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [createTouch(0, 100, 100), createTouch(1, 150, 100)],
          cancelable: true,
        })
      );

      // TouchEnd (fingers released without moving)
      container.dispatchEvent(
        new TouchEvent('touchend', {
          touches: [],
          changedTouches: [createTouch(0, 100, 100), createTouch(1, 150, 100)],
          cancelable: true,
        })
      );

      // Should emit right-click (button 2)
      const rightClicks = commands.filter(
        (c) => c.type === 'mouse-click' && c.payload.button === 2
      );
      expect(rightClicks.length).toBe(2); // down and up
      expect(rightClicks[0].payload.pressed).toBe(true);
      expect(rightClicks[1].payload.pressed).toBe(false);
    });

    it('handles touch gestures: 1-finger drag emits mouse-move', () => {
      engine.attach(container, (cmd) => commands.push(cmd));

      const createTouch = (id: number, x: number, y: number) =>
        ({ identifier: id, clientX: x, clientY: y } as Touch);

      container.dispatchEvent(
        new TouchEvent('touchstart', {
          touches: [createTouch(0, 100, 100)],
          cancelable: true,
        })
      );

      container.dispatchEvent(
        new TouchEvent('touchmove', {
          touches: [createTouch(0, 125, 110)],
          cancelable: true,
        })
      );

      const moves = commands.filter((c) => c.type === 'mouse-move');
      expect(moves.length).toBe(1);
      expect(moves[0].payload).toEqual({ dx: 25, dy: 10 });
    });
  });
});
