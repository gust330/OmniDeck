# OmniDeck Mobile

OmniDeck is a high-performance cross-platform remote desktop companion app for iOS and Android smartphones in landscape mode. Designed around iPadOS 18 Liquid Glass aesthetics, it provides tactile remote desktop interaction, system telemetry monitoring, Stage Manager window switching, and peripheral management for workstations and gaming rigs.

---

## Features

### 1. Stream Workspace
- **Dynamic Island HUD**: Displays host connection identity, real-time FPS, network ping, and a segmented input mode selector (`Touch` vs `Trackpad`). Includes one-touch settings access.
- **Left-Thumb Modifier Ribbon**: Ergonomic vertical strip for thumb activation with three-state latching and locking (`inactive` → `latched` → `locked`):
  - `⎋` Escape, `⇥` Tab, `⌃` Control, `⌥` Option, `⌘` Command, `⇧` Shift, `F5` Refresh.
- **Right-Thumb Action Pod**: Dedicated capsule featuring:
  - Tactile Right-Click button.
  - Interactive vertical momentum scroll slider with bi-directional indicators.
  - On-screen keyboard toggle (with `@capacitor/keyboard` native integration).
  - One-tap Exposé trigger for Stage Manager view.
- **Floating Squircle Dock**: Quick-launch bar featuring pinned workstation apps, launch indicators, Stage Manager trigger, and an interactive Spotify mini-player with live playback status.
- **Interactive Remote Desktop Canvas**:
  - Live WebRTC `<video>` display when connected to an active host stream.
  - Built-in interactive code editor, terminal, and 3D viewport fallback when operating without a live host.
  - Real-time precision trackpad dot cursor synchronized with pointer deltas.

### 2. Control Center
- **Vertical Tactile Sliders**: Fluid adjustments for Host Master Audio Volume and Rig HDR Monitor Brightness with percentage readouts.
- **Concentric Activity Telemetry Rings**: Real-time Apple Fitness-style concentric SVG rings tracking CPU, GPU, and RAM utilization alongside temperature and system power draw.
- **Audio Routing**: Instant segmented switcher between `Studio Rig` (host speakers) and `iPhone Audio` (local mobile device).
- **Single Window Focus**: Toggle to isolate and stream only the foreground application.

### 3. Stage Manager App Library
- **8-App Grid**: Live desktop application launcher with active and idle status badges (`VS Code`, `Chrome`, `zsh Terminal`, `Blender`, `Spotify`, `Steam`, `Discord`, `Docker`).
- **Category Filtering & Search**: Instant filtering across `All Apps`, `Dev`, `Gaming`, and `Media` plus real-time text search.
- **Focus on Phone**: One-touch window routing that maximizes the selected remote application and returns to the stream workspace.

### 4. Dock Manager & Workspace Presets
- **Preset Configurations**: One-tap switching between workspace environments:
  - `Coding & DevOps`: VS Code, Terminal, Docker, Chrome.
  - `Gaming Rig`: Steam, Discord, OBS, Performance Overlay.
  - `Cinema & Couch`: Plex, Spotify, Browser, System Volume.
  - `3D Studio`: Blender, Unreal Engine, Photoshop, Reference.
- **Peripheral Auto-Switch Hook**: Toggle automated workspace transitions upon connecting external hardware (Bluetooth controllers, keyboards, or mice).

### 5. Settings & Touch Calibration
- **Host Configuration**: Host machine name and WebSocket/WebRTC signaling endpoint.
- **Stream Quality**: Resolution scaling (`1080p`, `1440p`, `4K`), variable bitrate slider (`10 Mbps` to `150 Mbps`), and hardware video codecs (`AV1`, `H265`, `H264`).
- **Touch Calibration**: Custom touch sensitivity scaling (`50%` - `200%`) and dead-zone radius adjustment (`0 px` - `20 px`) persisted in store.
- **Settings Opening Trigger**: Selectable gestures (`HUD button`, `Three-finger tap`, `Two-finger double-tap`, `Corner swipe`).

---

## Tech Stack & Architecture

- **UI Framework**: React 19 + TypeScript
- **Styling**: Tailwind CSS v3 with custom iPadOS liquid glass filters, blur backdrops, and squircle card radii
- **State Management**: Zustand (modular stores for input state, connection parameters, and telemetry)
- **Native Bridge**: Capacitor 8
  - `@capacitor/core` & `@capacitor/cli`
  - `@capacitor/screen-orientation`: Enforces sensor-based landscape orientation
  - `@capacitor/status-bar`: Immersive fullscreen with dark styling and hidden system bars
  - `@capacitor/keyboard`: Accessory bar suppression and native keyboard invocation
  - `@capacitor/haptics`: Tactile feedback for scroll slider and modifier latching
- **Input & Stream Engines**:
  - `InputEngine`: Translates touch gestures (single tap, double tap, 2-finger right-click, drag), precision trackpad deltas, Pointer Lock mouse events, and suppresses browser shortcut collisions (`Tab`, `Escape`, `Ctrl+W`, `Ctrl+T`, `Alt+Tab`, `F1-F12`).
  - `StreamEngine`: WebRTC peer connection manager supporting WebSocket signaling (SDP offer/answer, ICE candidate exchange), RTCDataChannel for inputs and telemetry, and automatic fallback to interactive local canvas.
- **Testing**: Vitest + React Testing Library + `@testing-library/jest-dom`

---

## Getting Started

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### Web Development

```bash
# Navigate to the app directory
cd app

# Install dependencies
npm install

# Start local Vite development server
npm run dev

# Run unit and integration tests
npm test

# Run TypeScript typecheck and production build
npm run build
```

---

## Native Mobile Setup & Build

OmniDeck is configured for landscape-only operation on both iOS and Android.

### Android

#### Prerequisites
- Android Studio Ladybug (or newer)
- Android SDK Platform 34+
- Java Development Kit (JDK) 17 or 21

#### Build Steps
1. Build the web distribution and synchronize Capacitor:
   ```bash
   cd app
   npm run build
   npx cap sync android
   ```

2. Open the project in Android Studio:
   ```bash
   npx cap open android
   ```

3. Or build the debug APK via Gradle command line:
   ```bash
   cd android
   ./gradlew assembleDebug
   ```
   The resulting APK will be located at:
   `android/app/build/outputs/apk/debug/app-debug.apk`

*Configuration note:* Android screen orientation is locked to `sensorLandscape` in `android/app/src/main/AndroidManifest.xml`, allowing seamless 180° rotation between left and right landscape orientations while preventing portrait mode.

---

### iOS

#### Prerequisites
- macOS Sonoma (or newer)
- Xcode 15 or 16
- CocoaPods or Swift Package Manager (Capacitor 8 uses Swift Package Manager by default)

#### Build Steps
1. Build the web distribution and synchronize Capacitor:
   ```bash
   cd app
   npm run build
   npx cap sync ios
   ```

2. Open the project in Xcode:
   ```bash
   npx cap open ios
   ```

3. In Xcode:
   - Select your connected iOS device or iPad/iPhone Simulator.
   - Choose your Development Team under **Signing & Capabilities**.
   - Press **Cmd + R** to run or **Product > Archive** to package for TestFlight / App Store.

*Configuration note:* Orientation is locked to `UIInterfaceOrientationLandscapeLeft` and `UIInterfaceOrientationLandscapeRight` in `ios/App/App/Info.plist`. Status bar visibility is suppressed via `UIStatusBarHidden = true` and `UIViewControllerBasedStatusBarAppearance = false`.

---

## Verification & Test Suite

The test suite covers state management, pointer math, desktop shortcut interception, component rendering, and WebRTC signaling lifecycle:

```bash
npm test
```

Test coverage includes:
- `input-store.test.ts`: Modifier 3-state cycling (`inactive` → `latched` → `locked`), cursor positions, touch calibration parameters, and gamepad polling state.
- `telemetry-store.test.ts`: Hardware telemetry updates (CPU, GPU, RAM, temps, bitrate, ping) and reset behavior.
- `connection-store.test.ts`: View navigation, volume/brightness percentage clamping, audio routing, single-window focus, and host settings persistence.
- `input-engine.test.ts`: Pointer delta scaling with sensitivity, touch gesture mapping (two-finger tap to right-click, single-finger drag to pointer move), desktop shortcut suppression (`Tab`, `Escape`, `F1-F12`, `Ctrl+W`, `Ctrl+T`), and DOM event cleanup.
- `stream-engine.test.ts`: WebRTC connection lifecycle, WebSocket signaling offer/answer exchange, ICE candidate propagation, telemetry parsing, and mock mode fallback.
- `components.test.tsx`: UI rendering and interaction tests for `ModifierRibbon`, `DynamicIslandHUD`, `ActionPod`, `ControlCenter`, `DockManager`, `AppLibrary`, and `SettingsModal`.
- `stream-workspace.test.tsx`: End-to-end integration between `StreamWorkspace`, `InputEngine`, and `StreamEngine`.
