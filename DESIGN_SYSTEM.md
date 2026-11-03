# OmniTouch OS & OmniDeck — Design System & Architecture Specification
**iPadOS-Inspired Remote PC Companion for Smartphones in Landscape Orientation**

---

## 1. Executive Summary & Product Direction

**OmniTouch OS** (incorporating OmniDeck) is an iPadOS-inspired remote personal computer companion app built specifically for smartphones used in **landscape mode** (20:9 / 19.5:9 aspect ratios, e.g. iPhone 16 Pro Max, Galaxy S24 Ultra). 

Instead of cramming a full 4K Windows/macOS desktop onto a handheld screen, OmniTouch adopts **Apple Human Interface Guidelines (HIG)** and iPadOS 18 liquid glass materials:
- **Liquid Glass Materials**: Translucent system vibrancy (`backdrop-filter: blur(40px)`), delicate `0.5px` white specular inner borders, and continuous Apple squircle curvature (`rounded-[26px]`, `rounded-full`).
- **Two-Thumb Landscape Ergonomics**: Grouping all critical controls within the natural resting reach of the left and right thumbs (bottom-left and bottom-right corners).
- **Single Window Focus & Stage Manager**: Auto-crops and focuses active PC windows (VS Code, Browser, Blender) for clear mobile readability rather than forcing the user to squint at multiple tiny desktop windows.
- **Hardware Mouse & Keyboard Passthrough**: Seamless raw pointer lock, low-latency USB/Bluetooth input, and external game controller support.

---

## 2. Color Tokens & Material Hierarchy

| Token Name | Hex / RGBA | Apple HIG Alignment | Usage |
| :--- | :--- | :--- | :--- |
| **System Canvas** | `#07090E` | System Background (Dark) | Base OLED-saving deep background |
| **System Liquid Glass** | `rgba(24, 28, 42, 0.65)` | UIBlurEffect / System Thin | Primary floating cards, Control Center pods |
| **Glass Vibrant** | `rgba(36, 42, 64, 0.75)` | UIBlurEffect / Regular Vibrant | Thumb accessory capsules, dock containers |
| **Specular Stroke** | `rgba(255, 255, 255, 0.14)` | 0.5px Apple Specular Highlight | Tactile hairline inner rim on all cards |
| **System Azure** | `#0A84FF` | Apple System Blue / Tint | Active buttons, selected toggles, Ctrl/Cmd lock |
| **System Mint** | `#30D158` | Apple System Green | Live connection status, low latency, GPU health |
| **System Amber** | `#FF9F0A` | Apple System Orange/Yellow | Monitor HDR brightness level, thermals |
| **System Purple** | `#BF5AF2` | Apple System Indigo/Purple | DDR5 RAM telemetry, Docker containers |
| **System Red** | `#FF453A` | Apple System Destructive | Disconnect button, kill process badge |

---

## 3. Touch Ergonomics & Interaction Model

### A. Left-Thumb Accessory Modifier Strip (Within thumb arc)
- **7 Tactile Squircles (44px+)**: `⎋ Esc`, `⇥ Tab`, `⌃ Ctrl`, `⌥ Opt`, `⌘ Cmd / Win`, `⇧ Shift`, `F5`.
- **Chording & Latch States**:
  - *Single Tap*: Latches modifier for the next action (e.g. tap `⌘`, then tap text on PC -> executes `⌘+Click`).
  - *Double Tap*: Locks modifier on (illuminates in glowing System Azure with haptic click).
  - *Tap Again*: Clears lock.

### B. Right-Thumb Touch Action Capsule
- **Right Click Trigger**: Dedicated 44px+ secondary click button with haptic tick.
- **Continuous Scroll Slider**: Tactile vertical pill with textured haptic grip for buttery smooth scrolling through web pages, code, and documents.
- **On-Screen Keyboard**: 1-tap summon for virtual keyboard with shortcut bar.
- **Task Switcher / Exposé**: Instant remote window switcher.

### C. Top Dynamic Island HUD
- Compact 36px floating pill at top center:
  - Host status (`TITAN-RIG • 120 FPS • 2.1ms`).
  - Peripheral passthrough pill (`🖱️ Physical Mouse (Raw 1:1) • ⌨️ Magic Keyboard Active`).
  - Segmented input mode switcher: `[Touch]` | `[Trackpad]` | `[Gamepad]`.
  - Disconnect trigger.

### D. Bottom iPadOS Floating Dock
- Floating glass squircle dock with running app badges: `VS Code`, `Google Chrome`, `Terminal`, `Blender`, `Steam`.
- Integrated Spotify mini-widget (Now Playing, track progress bar, play/pause).
- Contextual gesture banner: `Two-finger tap: Right Click • Pinch: Zoom • 3-Finger: Mission Control`.

---

## 4. Control Center & Stage Manager App Library (Screen 4)

- **Left Section (Control Center)**:
  - Native iOS vertical sliders for Volume (75%) and Rig HDR Brightness (85%).
  - Apple Activity-style concentric telemetry rings (CPU 24%, GPU 45%, RAM 50%, Power 285W).
  - Audio output routing: Instant 1-tap switch between Studio Rig Speakers and iPhone Audio (Opus 48kHz low-jitter stream).
  - Single Window Focus mode switch.
- **Right Section (App Library & Stage Manager Grid)**:
  - 8 High-density tactile squircle app tiles with live status badges.
  - 1-tap `Focus on Phone` button for each application.
  - Category filters (`All Apps`, `Dev`, `Gaming`, `Media`) and quick search.

---

## 5. Screen Inventory & Artifacts

All screens generated via **Google Stitch MCP** and saved to the project workspace:

1. **Screen 1 (iPadOS Stream Workspace)**:
   - Screenshot: `omnitouch_ipados_stream_v2.png`
   - HTML: `omnitouch_ipados_stream_v2.html`
   - Stitch Screen ID: `97135d6782084a07beb820df603e275c`

2. **Screen 2 (iPadOS Control Center & App Library)**:
   - Screenshot: `omnitouch_control_center_v2.png`
   - HTML: `omnitouch_control_center_v2.html`
   - Stitch Screen ID: `8680b9e075e24682846793cdb217a7b7`

3. **Screen 3 (Cyberdeck Stream Workspace)**:
   - Screenshot: `omnideck_stream_workspace_v1.png`
   - HTML: `omnideck_stream_workspace_v1.html`
   - Stitch Screen ID: `bf4ebcb05fe240ba84117e802b810dcb`

4. **Screen 4 (Telemetry & Host Rig Dashboard)**:
   - Screenshot: `omnideck_dashboard_v1.png`
   - HTML: `omnideck_dashboard_v1.html`
   - Stitch Screen ID: `28c2c3e37d06449f89a7eb11e4746d75`

5. **Screen 5 (Workspaces & Dock Profile Customizer)**:
   - Screenshot: `omnideck_workspaces_dock_v1.png`
   - HTML: `omnideck_workspaces_dock_v1.html`
   - Stitch Screen ID: `acd24db2db344b98be2a378898ae16b5`

6. **Interactive Landscape Device Showcase**:
   - `index.html` (Complete interactive preview with simulated landscape phone chassis, dynamic punch-hole, and instant screen switching).
