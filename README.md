# OmniDeck

OmniDeck is an iPadOS 18 Liquid Glass-inspired remote desktop control system and mobile companion application for developer workstations and high-performance gaming rigs. It turns iOS and Android smartphones in landscape mode into precision remote tactile surfaces.

---

## Repository Structure

- **`app/`**: Production cross-platform mobile application built with React 19, TypeScript, Tailwind CSS v3, Zustand, and Capacitor 8 (with native iOS and Android projects).
- **`DESIGN_SYSTEM.md`**: Design system specification defining color tokens, blur materials, typography, radii, elevation shadows, layout geometry, and interaction feedback patterns.
- **Prototypes (`*.html`)**:
  - `omnitouch_ipados_stream_v2.html`: iPadOS liquid glass stream workspace prototype featuring Dynamic Island HUD, left-thumb modifier ribbon, and right-thumb action pod.
  - `omnitouch_control_center_v2.html`: iPadOS Control Center prototype featuring concentric activity rings, vertical sliders, and audio routing.
  - `omnideck_workspaces_dock_v1.html`: Dock and workspace manager prototype with Stage Manager app grid and peripheral auto-switch hooks.
  - `omnideck_stream_workspace_v1.html`, `omnideck_dashboard_v1.html`: Stream and telemetry dashboards.

---

## Mobile Application Features (`app/`)

### 1. Stream Workspace
- **Dynamic Island HUD**: Live rig identity, 120 FPS counter, 2.1 ms ping readout, segmented `Touch` vs `Trackpad` switcher, and one-tap Settings access.
- **Left-Thumb Modifier Ribbon**: 7 dedicated modifier keys (`⎋ Esc`, `⇥ Tab`, `⌃ Ctrl`, `⌥ Opt`, `⌘ Cmd`, `⇧ Shift`, `F5`) supporting 3-state latching/locking (`inactive` → `latched` → `locked` → `inactive`).
- **Right-Thumb Action Pod**: Dedicated capsule with tactile Right-Click, vertical momentum scroll slider with bi-directional indicators, native on-screen keyboard toggle, and Exposé trigger.
- **Floating Squircle Dock**: Quick-switch app dock with Spotify widget showing live playback status.
- **Remote Desktop Canvas**: Live WebRTC `<video>` display when connected to an active host; interactive code editor and terminal fallback when operating standalone. Dynamic hardware cursor dot tracking pointer movement.

### 2. Control Center
- **Tactile Vertical Sliders**: Master Audio Volume and Rig HDR Brightness with instant percentage feedback.
- **Concentric Activity Rings**: Real-time concentric rings tracking CPU, GPU, and RAM utilization, plus temperatures and wattage.
- **Audio Routing**: Segmented selector switching audio output between `Studio Rig` and `iPhone Audio`.
- **Single Window Focus**: Toggle to isolate and focus on the foreground workstation window.

### 3. Stage Manager App Library
- **8-App Workspace Grid**: Live status badges (`Active` / `Idle`) for VS Code, Chrome, Terminal, Blender, Spotify, Steam, Discord, and Docker.
- **Category Filter & Search**: Instant filtering (`All Apps`, `Dev`, `Gaming`, `Media`) and full-text search.
- **Focus on Phone**: 1-tap window routing that focuses the selected app on the mobile device and returns to the stream workspace.

### 4. Dock Manager & Workspace Presets
- **Preset Configurations**: One-tap workspace switching (`Coding & DevOps`, `Gaming Rig`, `Cinema & Couch`, `3D Studio`).
- **Peripheral Hook**: Auto-switch dock presets upon detecting connected Bluetooth or USB peripherals.

### 5. Settings & Touch Calibration
- **Host Connection**: Host workstation name and WebSocket/WebRTC signaling endpoint.
- **Stream Quality**: 1080p / 1440p / 4K resolution selection, 10–150 Mbps bitrate slider, and AV1 / H265 / H264 hardware codecs.
- **Touch Calibration**: Adjustable touch sensitivity (`50%` - `200%`) and dead-zone radius (`0 px` - `20 px`) persisted to the input store.
- **Opening Trigger**: Configurable settings gestures (`HUD button`, `Three-finger tap`, `Two-finger double-tap`, `Corner swipe`).

---

## Input & Remote Interaction Engines

- **Touch & Gesture Translation**: Direct tap (click), double-tap, two-finger tap (right-click), and drag-to-move pointer.
- **Precision Trackpad**: Dynamic Apple-style circular cursor dot tracking raw delta movement.
- **External Mouse & Pointer Lock**: Full `requestPointerLock` support, raw mouse movement, middle/right click, and wheel scrolling.
- **Desktop Shortcut Interception**: Global keyboard listener intercepting desktop shortcuts (`Tab`, `Escape`, `F1-F12`, `Ctrl+W`, `Ctrl+T`, `Alt+Tab`, `Alt+F4`, `Meta+Q`) and calling `preventDefault()` / `stopPropagation()` to prevent browser/OS tab closing or navigation.
- **Gamepad API Polling**: Animation-frame polling loop supporting standard DualSense and Xbox gamepads.
- **WebRTC Stream Engine**: Peer connection manager with WebSocket signaling (SDP offer/answer, ICE candidate exchange), RTCDataChannel for input commands and telemetry, and automatic fallback to interactive local canvas.

---

## Quickstart

### Web Application

```bash
cd app
npm install
npm run dev
```

### Verification & Testing

```bash
cd app
# Run 62 unit and integration tests across 7 test suites
npm test

# Run TypeScript typechecks and production build
npm run build
```

### Native Mobile Builds (iOS & Android)

The app is locked to sensor-based landscape orientation (`LandscapeLeft` and `LandscapeRight`) and configured for immersive fullscreen with hidden status and accessory bars.

#### Android
```bash
cd app
npm run build
npx cap sync android
npx cap open android
# Or assemble via Gradle:
cd android && ./gradlew assembleDebug
```

#### iOS
```bash
cd app
npm run build
npx cap sync ios
npx cap open ios
# Build, run, or archive in Xcode (targeting iOS 15+)
```

For detailed platform notes, plugin architecture, and configuration options, see [`app/README.md`](app/README.md).
