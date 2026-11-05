import asyncio
import configparser
import io
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import threading
import time
from pathlib import Path

from PIL import Image

try:
    import asyncvnc
except ImportError:  # Reported by readiness/status on incomplete installs.
    asyncvnc = None

try:
    import psutil
except ImportError:  # Minimal installs still serve fallback telemetry.
    psutil = None

DEFAULT_CUA = Path("/home/gustavo/.hermes/tools/cua-driver-0.21.0-linux-x64/cua-driver")


class GnomeShellBridge:
    """Narrow client for the OmniDeck GNOME Shell extension."""

    BUS_NAME = "io.github.omnideck.ShellBridge"
    OBJECT_PATH = "/io/github/omnideck/ShellBridge"
    INTERFACE = BUS_NAME

    def _call(self, method: str, *args: str):
        command = [
            "gdbus", "call", "--session", "--dest", self.BUS_NAME,
            "--object-path", self.OBJECT_PATH, "--method", f"{self.INTERFACE}.{method}",
            *args,
        ]
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=3, shell=False)
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "GNOME Shell bridge is unavailable")
        # gdbus prints a one-element tuple containing a quoted JSON string.
        import ast
        values = ast.literal_eval(result.stdout.strip())
        payload = values[0]
        parsed = json.loads(payload)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
        return parsed

    def list_windows(self):
        return self._call("ListWindows")

    def activate(self, app_id: str):
        return self._call("Activate", app_id)


class LinuxBackend:
    def __init__(self, app_dirs=None, cua_driver: Path | None = None, shell_bridge=None):
        self.app_dirs = [Path(p) for p in (app_dirs or self._default_app_dirs())]
        self.cua_driver = Path(cua_driver or os.environ.get("OMNIDECK_CUA_DRIVER", DEFAULT_CUA))
        self.crop_enabled = False
        self.shell_bridge = shell_bridge or GnomeShellBridge()
        self._active_window = None
        self._cursor: list[float] = [0.0, 0.0]
        self._last_frame_at = 0.0
        self._frame_rect = (0, 0, 1920, 1080)
        self._vnc_host = os.environ.get("OMNIDECK_VNC_HOST", "127.0.0.1")
        self._vnc_port = int(os.environ.get("OMNIDECK_VNC_PORT", "5900"))
        self._vnc_password = os.environ.get("OMNIDECK_VNC_PASSWORD", "omnideck")
        self._vnc_loop = asyncio.new_event_loop()
        self._vnc_thread = threading.Thread(target=self._vnc_loop.run_forever, daemon=True, name="omnideck-vnc")
        self._vnc_thread.start()
        self._vnc_client = None
        self._vnc_lock = None

    @staticmethod
    def _default_app_dirs():
        dirs = [Path.home() / ".local/share/applications"]
        dirs.extend(Path(p) / "applications" for p in os.environ.get("XDG_DATA_DIRS", "/usr/local/share:/usr/share").split(":"))
        return dirs

    def get_status(self):
        apps = self.list_apps()
        return {
            "status": "ok",
            "host": socket.gethostname(),
            "platform": platform.system().lower(),
            "session": os.environ.get("XDG_SESSION_TYPE", "unknown").lower(),
            "metrics": self.get_telemetry(),
            "activeWindow": self.get_active_window(),
            "runningApps": [app for app in apps if app.get("running")],
            "capabilities": {
                "capture": asyncvnc is not None,
                "input": asyncvnc is not None,
                "volume": bool(shutil.which("wpctl") or shutil.which("pactl")),
                "power": bool(shutil.which("systemctl")),
            },
        }

    @staticmethod
    def _json_object(output: str):
        decoder = json.JSONDecoder()
        for index, char in enumerate(output):
            if char not in "[{":
                continue
            try:
                payload, _ = decoder.raw_decode(output[index:])
                return payload
            except json.JSONDecodeError:
                continue
        raise json.JSONDecodeError("No JSON object in command output", output, 0)

    def get_active_window(self):
        """Return focused-window geometry, preferring the Shell bridge."""
        empty = {"title": "", "appId": None, "bbox": None}
        try:
            windows = self.shell_bridge.list_windows()
            focused = next((item for item in windows if item.get("focused")), None)
            if focused:
                self._active_window = focused
                return focused
        except Exception:
            pass
        if self._active_window:
            return self._active_window
        if not self.cua_driver.is_file():
            return empty
        try:
            result = subprocess.run(
                [str(self.cua_driver), "call", "list_windows", "{}"],
                shell=False,
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
            if result.returncode != 0:
                return empty
            payload = self._json_object(result.stdout)
            windows = payload.get("windows", payload.get("data", payload if isinstance(payload, list) else []))
            if not isinstance(windows, list):
                return empty
            focused = next((item for item in windows if item.get("focused") or item.get("active")), None)
            if focused is None and windows:
                focused = windows[0]
            if not focused:
                return empty
            bounds = focused.get("bounds") or focused.get("bbox") or {}
            bbox = {
                "x": float(bounds.get("x", 0)),
                "y": float(bounds.get("y", 0)),
                "width": float(bounds.get("width", 0)),
                "height": float(bounds.get("height", 0)),
            }
            if bbox["width"] <= 0 or bbox["height"] <= 0:
                bbox = None
            return {
                "title": str(focused.get("title") or focused.get("name") or ""),
                "appId": focused.get("app_id") or focused.get("appId") or focused.get("app"),
                "bbox": bbox,
            }
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError, TypeError, ValueError):
            return empty

    def list_apps(self):
        apps = {}
        if psutil is not None:
            running_text = " ".join(proc.info.get("name") or "" for proc in psutil.process_iter(["name"])).lower()
        else:
            running_text = ""
        for directory in self.app_dirs:
            if not directory.is_dir():
                continue
            for path in directory.glob("*.desktop"):
                if path.name in apps:
                    continue
                parser = configparser.ConfigParser(interpolation=None, strict=False)
                try:
                    parser.read(path, encoding="utf-8")
                    entry = parser["Desktop Entry"]
                except (OSError, KeyError, configparser.Error):
                    continue
                if entry.get("Type", "Application") != "Application" or entry.getboolean("NoDisplay", fallback=False) or entry.getboolean("Hidden", fallback=False):
                    continue
                name = entry.get("Name", path.stem).strip()
                executable = self._exec_binary(entry.get("Exec", ""))
                apps[path.name] = {
                    "id": path.name,
                    "name": name,
                    "running": bool(executable and Path(executable).name.lower() in running_text),
                }
        return sorted(apps.values(), key=lambda app: app["name"].casefold())

    @staticmethod
    def _exec_binary(exec_line: str):
        cleaned = re.sub(r"%[fFuUdDnNickvm]", "", exec_line).strip()
        try:
            import shlex
            return shlex.split(cleaned)[0] if cleaned else ""
        except ValueError:
            return ""

    def _known_app(self, app_id: str):
        if not re.fullmatch(r"[A-Za-z0-9_.+-]+\.desktop", app_id):
            raise ValueError("Invalid desktop application id")
        if not any(app["id"] == app_id for app in self.list_apps()):
            raise ValueError("Unknown desktop application")

    def _match_app(self, target: str, candidate: str | None) -> bool:
        return candidate == target

    def open_app(self, app_id: str, timeout: float = 5.0, poll_interval: float = 0.2):
        self._known_app(app_id)
        existing = []
        try:
            existing = self.shell_bridge.list_windows()
        except Exception:
            pass

        target_window = next((w for w in existing if self._match_app(app_id, w.get("appId"))), None)
        if target_window:
            activated = self.shell_bridge.activate(app_id)
            meta = activated or target_window
            self.crop_enabled = True
            self._active_window = meta
            return {**meta, "launched": False}

        self.launch_app(app_id)
        deadline = time.monotonic() + timeout
        while time.monotonic() <= deadline:
            time.sleep(poll_interval)
            try:
                windows = self.shell_bridge.list_windows()
                found = next((w for w in windows if self._match_app(app_id, w.get("appId"))), None)
                if found:
                    activated = self.shell_bridge.activate(app_id)
                    meta = activated or found
                    self.crop_enabled = True
                    self._active_window = meta
                    return {**meta, "launched": True}
            except Exception as exc:
                if isinstance(exc, (TimeoutError,)):
                    raise
                pass

        raise TimeoutError(f"Window for {app_id} did not appear within {timeout}s")

    def launch_app(self, app_id: str):
        self._known_app(app_id)
        subprocess.Popen(["gtk-launch", app_id.removesuffix(".desktop")], shell=False, start_new_session=True)

    def focus_app(self, app_id: str):
        self._known_app(app_id)
        if hasattr(self.shell_bridge, "activate"):
            try:
                activated = self.shell_bridge.activate(app_id)
                if activated:
                    self.crop_enabled = True
                    self._active_window = activated
                    return activated
            except Exception:
                pass
        cua_ok = self._cua("bring_to_front", {"app": app_id.removesuffix(".desktop")})
        if cua_ok:
            self.crop_enabled = True
            active = self.get_active_window()
            return active or {"appId": app_id}
        return {"appId": app_id}

    def set_volume(self, level: int):
        level = max(0, min(100, int(level)))
        if shutil.which("wpctl"):
            subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", f"{level}%"], check=True, shell=False, timeout=5)
        elif shutil.which("pactl"):
            subprocess.run(["pactl", "set-sink-volume", "@DEFAULT_SINK@", f"{level}%"], check=True, shell=False, timeout=5)
        else:
            raise RuntimeError("No PipeWire/PulseAudio volume command is available")

    def power(self, action: str):
        commands = {
            "lock": ["loginctl", "lock-session"],
            "suspend": ["systemctl", "suspend"],
            "shutdown": ["systemctl", "poweroff"],
            "reboot": ["systemctl", "reboot"],
        }
        if action not in commands:
            raise ValueError("Unsupported power action")
        subprocess.run(commands[action], check=True, shell=False, timeout=10)

    def set_crop(self, enabled: bool):
        self.crop_enabled = bool(enabled)

    def _cua(self, tool: str, arguments: dict):
        if not self.cua_driver:
            return False
        try:
            result = subprocess.run(
                [str(self.cua_driver), "call", tool, json.dumps(arguments, separators=(",", ":"))],
                shell=False,
                check=False,
                capture_output=True,
                text=True,
                timeout=3,
            )
            return getattr(result, "returncode", 0) == 0
        except (OSError, subprocess.SubprocessError):
            return False

    def _run_vnc(self, coroutine, timeout=10):
        if asyncvnc is None:
            raise RuntimeError("asyncvnc is not installed")
        future = asyncio.run_coroutine_threadsafe(coroutine, self._vnc_loop)
        return future.result(timeout=timeout)

    async def _ensure_vnc(self):
        if self._vnc_lock is None:
            self._vnc_lock = asyncio.Lock()
        if self._vnc_client is None:
            context = asyncvnc.connect(
                self._vnc_host, self._vnc_port, password=self._vnc_password
            )
            self._vnc_client = await context.__aenter__()
            self._vnc_context = context
        return self._vnc_client

    async def _vnc_screenshot(self):
        if self._vnc_lock is None:
            self._vnc_lock = asyncio.Lock()
        async with self._vnc_lock:
            client = await self._ensure_vnc()
            try:
                pixels = await client.screenshot()
                await client.drain()
                return pixels
            except Exception:
                self._vnc_client = None
                raise

    async def _vnc_action(self, action, payload):
        if self._vnc_lock is None:
            self._vnc_lock = asyncio.Lock()
        async with self._vnc_lock:
            client = await self._ensure_vnc()
            mouse = client.mouse
            keyboard = client.keyboard
            if action == "move":
                mouse.move(int(payload["x"]), int(payload["y"]))
            elif action == "button":
                button = int(payload["button"])
                mask = 1 << button
                if payload["pressed"]:
                    mouse.buttons |= mask
                else:
                    mouse.buttons &= ~mask
                mouse._write()
            elif action == "click":
                mouse.click(int(payload["button"]))
            elif action == "scroll":
                amount = int(payload["amount"])
                (mouse.scroll_down if amount > 0 else mouse.scroll_up)(abs(amount))
            elif action == "key":
                key = self._vnc_key(str(payload["key"]))
                if key not in asyncvnc.key_codes:
                    raise ValueError(f"Unsupported key: {key}")
                code = asyncvnc.key_codes[key].to_bytes(4, "big")
                keyboard.writer.write(
                    b"\x04" + (b"\x01" if payload["pressed"] else b"\x00") + b"\x00\x00" + code
                )
            elif action == "text":
                keyboard.write(str(payload["text"]))
            await client.drain()

    @staticmethod
    def _vnc_key(key):
        aliases = {
            "Enter": "Return", "Backspace": "BackSpace", " ": "space",
            "ArrowUp": "Up", "ArrowDown": "Down", "ArrowLeft": "Left", "ArrowRight": "Right",
            "Control": "Control_L", "Ctrl": "Control_L", "Alt": "Alt_L",
            "Shift": "Shift_L", "Meta": "Super_L",
        }
        return aliases.get(key, key)

    def _get_screen_dimensions(self) -> tuple[float, float]:
        if self._vnc_client is not None:
            return float(self._vnc_client.video.width), float(self._vnc_client.video.height)
        return float(self._frame_rect[2]), float(self._frame_rect[3])

    def _map_coordinates(self, payload: dict) -> list[int] | None:
        normalized_x = payload.get("normalizedX")
        normalized_y = payload.get("normalizedY")
        if normalized_x is None or normalized_y is None:
            return None
        nx = max(0.0, min(1.0, float(normalized_x)))
        ny = max(0.0, min(1.0, float(normalized_y)))
        x, y, width, height = self._frame_rect
        return [
            x + min(max(0, width - 1), int(nx * width)),
            y + min(max(0, height - 1), int(ny * height)),
        ]

    def handle_input(self, command: dict):
        kind = command.get("type")
        payload = command.get("payload") or {}
        if kind == "mouse-move":
            mapped = self._map_coordinates(payload)
            if mapped is not None:
                self._cursor = [float(mapped[0]), float(mapped[1])]
            else:
                width, height = self._get_screen_dimensions()
                self._cursor[0] = max(0.0, min(width - 1.0, self._cursor[0] + float(payload.get("dx", 0))))
                self._cursor[1] = max(0.0, min(height - 1.0, self._cursor[1] + float(payload.get("dy", 0))))
            self._run_vnc(self._vnc_action("move", {"x": int(self._cursor[0]), "y": int(self._cursor[1])}))
        elif kind == "mouse-click":
            mapped = self._map_coordinates(payload)
            if mapped is not None:
                self._cursor = [float(mapped[0]), float(mapped[1])]
                self._run_vnc(self._vnc_action("move", {"x": mapped[0], "y": mapped[1]}))
            self._run_vnc(self._vnc_action("button", {
                "button": int(payload.get("button", 0)), "pressed": bool(payload.get("pressed", True))
            }))
        elif kind == "mouse-scroll":
            delta = float(payload.get("deltaY", 0))
            amount = max(-20, min(20, int(delta / 20) or (1 if delta > 0 else -1 if delta < 0 else 0)))
            if amount:
                self._run_vnc(self._vnc_action("scroll", {"amount": amount}))
        elif kind == "text":
            self._run_vnc(self._vnc_action("text", {"text": str(payload.get("text", ""))[:4096]}))
        elif kind in {"key-down", "key-up"}:
            if "text" in payload:
                if kind == "key-down":
                    self._run_vnc(self._vnc_action("text", {"text": str(payload["text"])[:4096]}))
                return
            key = str(payload.get("key", ""))[:32]
            if key:
                self._run_vnc(self._vnc_action("key", {"key": key, "pressed": kind == "key-down"}))

    def _source_rect(self, width, height):
        if not self.crop_enabled:
            return (0, 0, width, height)
        active = self.get_active_window()
        bbox = active.get("bbox") if active else None
        if bbox:
            left = max(0, min(width - 1, int(bbox["x"])))
            top = max(0, min(height - 1, int(bbox["y"])))
            right = max(left + 1, min(width, int(bbox["x"] + bbox["width"])))
            bottom = max(top + 1, min(height, int(bbox["y"] + bbox["height"])))
            return (left, top, right - left, bottom - top)
        target_ratio = 20 / 9
        crop_width = min(width, int(height * target_ratio))
        crop_height = min(height, int(crop_width / target_ratio))
        return ((width - crop_width) // 2, (height - crop_height) // 2, crop_width, crop_height)

    def capture_frame(self):
        try:
            pixels = self._run_vnc(self._vnc_screenshot(), timeout=15)
            image = Image.fromarray(pixels, "RGBA").convert("RGB")
        except Exception:
            from PIL import ImageDraw
            image = Image.new("RGB", (1280, 720), (18, 20, 26))
            draw = ImageDraw.Draw(image)
            draw.text((40, 40), "OmniDeck capture unavailable", fill=(220, 225, 235))
            draw.text((40, 75), "VNC or desktop capture error.", fill=(150, 160, 180))

        x, y, width, height = self._source_rect(*image.size)
        self._frame_rect = (x, y, width, height)
        if (x, y, width, height) != (0, 0, *image.size):
            image = image.crop((x, y, x + width, y + height))
        image.thumbnail((1280, 720))
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=75, optimize=True)
        self._last_frame_at = time.monotonic()
        return output.getvalue()

    def get_telemetry(self):
        if psutil is None:
            return {
                "cpu": 0.0,
                "ram": 0.0,
                "ramUsed": 0.0,
                "ramTotal": 0.0,
                "cpuTemp": 0.0,
                "gpuTemp": 0.0,
                "power": 0,
                "bitrate": 0,
                "ping": 0,
                "fps": 1,
            }
        memory = psutil.virtual_memory()
        return {
            "cpu": psutil.cpu_percent(interval=None),
            "ram": memory.percent,
            "ramUsed": round(memory.used / (1024 ** 3), 1),
            "ramTotal": round(memory.total / (1024 ** 3), 1),
            "cpuTemp": self._temperature("coretemp", "k10temp"),
            "gpuTemp": self._temperature("amdgpu", "nouveau"),
            "power": 0,
            "bitrate": 0,
            "ping": 0,
            "fps": 1,
        }

    @staticmethod
    def _temperature(*names):
        if psutil is None:
            return 0
        try:
            temperatures = psutil.sensors_temperatures()
            for name in names:
                if temperatures.get(name):
                    return round(temperatures[name][0].current, 1)
        except (AttributeError, OSError):
            pass
        return 0
