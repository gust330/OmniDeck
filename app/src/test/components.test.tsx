import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ModifierRibbon } from '@/components/stream/ModifierRibbon';
import { DynamicIslandHUD } from '@/components/stream/DynamicIslandHUD';
import { ActionPod } from '@/components/stream/ActionPod';
import ControlCenter from '@/components/control-center/ControlCenter';
import DockManager from '@/components/dock/DockManager';
import SettingsModal from '@/components/settings/SettingsModal';
import AppLibrary from '@/components/app-library/AppLibrary';
import { StreamEngine } from '@/engines/stream-engine';
import { useInputStore } from '@/stores/input-store';
import { useConnectionStore } from '@/stores/connection-store';

describe('UI Component Architecture (iPadOS 18 Liquid Glass)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useInputStore.getState().clearAllModifiers();
    useConnectionStore.setState({
      status: 'connected',
      activeView: 'stream',
      showSettings: false,
      volume: 75,
      brightness: 85,
    });
  });

  describe('ModifierRibbon', () => {
    it('renders all 7 left-thumb modifiers with correct symbols', () => {
      render(<ModifierRibbon />);
      expect(screen.getByText('⎋')).toBeInTheDocument(); // Esc
      expect(screen.getByText('⇥')).toBeInTheDocument(); // Tab
      expect(screen.getByText('⌃')).toBeInTheDocument(); // Ctrl
      expect(screen.getByText('⌥')).toBeInTheDocument(); // Opt
      expect(screen.getByText('⌘')).toBeInTheDocument(); // Cmd
      expect(screen.getByText('⇧')).toBeInTheDocument(); // Shift
      expect(screen.getByText('F5')).toBeInTheDocument(); // F5
    });

    it('toggles modifier on click and updates aria/data-state', () => {
      render(<ModifierRibbon />);
      const ctrlBtn = screen.getByText('⌃').closest('button')!;
      expect(ctrlBtn.getAttribute('data-state')).toBe('inactive');

      // Click once -> latched
      fireEvent.click(ctrlBtn);
      expect(useInputStore.getState().modifiers.Control).toBe('latched');

      // Click again -> locked
      fireEvent.click(ctrlBtn);
      expect(useInputStore.getState().modifiers.Control).toBe('locked');
    });
  });

  describe('DynamicIslandHUD', () => {
    it('renders host rig identity, fps, and ping telemetry', () => {
      render(<DynamicIslandHUD />);
      expect(screen.getByText('TITAN-RIG')).toBeInTheDocument();
      expect(screen.getByText(/120\s*FPS/i)).toBeInTheDocument();
      expect(screen.getByText(/2\.1\s*ms/i)).toBeInTheDocument();
      expect(screen.getByText('Touch')).toBeInTheDocument();
      expect(screen.getByText('Trackpad')).toBeInTheDocument();
    });

    it('switches input mode when segmented control buttons are clicked', () => {
      render(<DynamicIslandHUD />);
      const trackpadBtn = screen.getByText('Trackpad');
      fireEvent.click(trackpadBtn);
      expect(useInputStore.getState().inputMode).toBe('trackpad');
    });

    it('triggers settings modal when settings button is clicked', () => {
      render(<DynamicIslandHUD />);
      const settingsBtn = screen.getByLabelText('Open settings');
      fireEvent.click(settingsBtn);
      expect(useConnectionStore.getState().showSettings).toBe(true);
    });
  });

  describe('ActionPod', () => {
    it('dispatches right-click and scroll velocity through its input controls', () => {
      const onRightClick = vi.fn();
      const onScroll = vi.fn();
      render(<ActionPod onRightClick={onRightClick} onScroll={onScroll} />);

      fireEvent.click(screen.getByLabelText('Right Click'));
      expect(onRightClick).toHaveBeenCalledTimes(1);

      const slider = screen.getByRole('slider', { name: 'Scroll velocity' });
      vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        height: 100,
        bottom: 200,
        left: 0,
        right: 32,
        width: 32,
        x: 0,
        y: 100,
        toJSON: () => ({}),
      });
      fireEvent.pointerDown(slider, { pointerId: 1, clientY: 175 });
      expect(onScroll).toHaveBeenCalledWith(50);
      fireEvent.pointerUp(slider, { pointerId: 1 });
      expect(useInputStore.getState().scroll).toEqual({ velocity: 0, isScrolling: false });
    });

    it('renders right click, scroll trigger, and expose actions', () => {
      render(<ActionPod />);
      expect(screen.getByLabelText('Right Click')).toBeInTheDocument();
      expect(screen.getByLabelText('Toggle Keyboard')).toBeInTheDocument();
      expect(screen.getByLabelText('Exposé')).toBeInTheDocument();
    });

    it('navigates to app-library view when Exposé is pressed', () => {
      render(<ActionPod />);
      const exposeBtn = screen.getByLabelText('Exposé');
      fireEvent.click(exposeBtn);
      expect(useConnectionStore.getState().activeView).toBe('app-library');
    });
  });

  describe('AppLibrary', () => {
    const mockApps = [
      { id: 'vscode.desktop', name: 'VS Code', category: 'dev', running: true, subtitle: 'OmniDeck workspace' },
      { id: 'terminal.desktop', name: 'zsh Terminal', category: 'dev', running: true, subtitle: '2 sessions' },
      { id: 'docker.desktop', name: 'Docker', category: 'dev', running: true, subtitle: '6 containers' },
      { id: 'blender.desktop', name: 'Blender', category: 'creative', running: false, subtitle: 'Scene ready' },
    ];

    it('renders server apps with status badges and open actions', async () => {
      vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue(mockApps);
      render(<AppLibrary />);
      expect(screen.getByRole('heading', { name: 'App Library' })).toBeInTheDocument();
      expect(await screen.findAllByRole('article')).toHaveLength(4);
      expect(screen.getAllByRole('button', { name: /Open .* on Phone/i })).toHaveLength(4);
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Idle').length).toBeGreaterThan(0);
    });

    it('returns to the stream after opening an app', async () => {
      vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue(mockApps);
      const openSpy = vi.spyOn(StreamEngine.prototype, 'openApp').mockResolvedValue({ running: true });
      render(<AppLibrary />);
      const buttons = await screen.findAllByRole('button', { name: /Open .* on Phone/i });
      fireEvent.click(buttons[0]);
      await vi.waitFor(() => expect(openSpy).toHaveBeenCalledWith('vscode.desktop'));
      expect(useConnectionStore.getState().activeView).toBe('stream');
    });

    it('filters apps by category and search query', async () => {
      vi.spyOn(StreamEngine.prototype, 'listApps').mockResolvedValue(mockApps);
      render(<AppLibrary />);
      await screen.findByText('VS Code');

      // Filter by Dev
      fireEvent.click(screen.getByRole('button', { name: 'Dev' }));
      expect(screen.getByText('VS Code')).toBeInTheDocument();
      expect(screen.getByText('zsh Terminal')).toBeInTheDocument();
      expect(screen.getByText('Docker')).toBeInTheDocument();
      expect(screen.queryByText('Blender')).not.toBeInTheDocument();

      // Search query
      const searchInput = screen.getByLabelText('Search apps');
      fireEvent.change(searchInput, { target: { value: 'Docker' } });
      expect(screen.getByText('Docker')).toBeInTheDocument();
      expect(screen.queryByText('VS Code')).not.toBeInTheDocument();

      // Search with no results
      fireEvent.change(searchInput, { target: { value: 'NonexistentApp' } });
      expect(screen.getByText('No apps match this filter.')).toBeInTheDocument();
    });

    it('opens settings from AppLibrary header', () => {
      render(<AppLibrary />);
      fireEvent.click(screen.getByLabelText('Open settings'));
      expect(useConnectionStore.getState().showSettings).toBe(true);
    });
  });

  describe('ControlCenter', () => {
    it('renders volume & brightness tactile sliders, host header, and Stage Manager chooser', () => {
      render(<ControlCenter />);
      expect(screen.getByText('Control Center')).toBeInTheDocument();
      expect(screen.getByText(/75%/i)).toBeInTheDocument(); // Volume
      expect(screen.getByText(/85%/i)).toBeInTheDocument(); // Brightness
      expect(screen.getByRole('button', { name: 'Choose application' })).toBeInTheDocument();
    });
  });

  describe('DockManager', () => {
    it('renders saved workspace presets and peripheral auto-switch card', () => {
      render(<DockManager />);
      expect(screen.getByText('Coding & DevOps')).toBeInTheDocument();
      expect(screen.getByText('Gaming Rig')).toBeInTheDocument();
      expect(screen.getByText('Cinema & Couch')).toBeInTheDocument();
      expect(screen.getByText('3D Studio')).toBeInTheDocument();
      expect(screen.getByText(/Auto-switch dock on Peripheral hook/i)).toBeInTheDocument();
    });
    it('returns to stream using its back navigation', () => {
      useConnectionStore.setState({ activeView: 'dock-manager' });
      render(<DockManager />);
      fireEvent.click(screen.getByRole('button', { name: /back to stream/i }));
      expect(useConnectionStore.getState().activeView).toBe('stream');
    });
  });

  describe('SettingsModal', () => {
    it('renders modal when showSettings is true', () => {
      useConnectionStore.setState({ showSettings: true });
      render(<SettingsModal />);
      expect(screen.getByText('Stream Settings')).toBeInTheDocument();
      expect(screen.getByDisplayValue('TITAN-RIG')).toBeInTheDocument();
      expect(screen.getByText('1080p')).toBeInTheDocument();
      expect(screen.getByText('4K')).toBeInTheDocument();
      expect(screen.getByRole('radiogroup', { name: 'Settings opening trigger' })).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Touch sensitivity' })).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Touch dead zone' })).toBeInTheDocument();
    });

    it('persists touch calibration and opening trigger in the input store', () => {
      useConnectionStore.setState({ showSettings: true });
      render(<SettingsModal />);
      fireEvent.change(screen.getByRole('slider', { name: 'Touch sensitivity' }), { target: { value: '125' } });
      fireEvent.change(screen.getByRole('slider', { name: 'Touch dead zone' }), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('radio', { name: 'Three-finger tap' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save & Close' }));
      expect(useInputStore.getState().touchCalibration).toEqual({ sensitivity: 125, deadZone: 8 });
      expect(useInputStore.getState().settingsTrigger).toBe('three-finger-tap');
    });

    it('does not render when showSettings is false', () => {
      useConnectionStore.setState({ showSettings: false });
      const { container } = render(<SettingsModal />);
      expect(container.firstChild).toBeNull();
    });
  });
});
