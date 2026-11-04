import configparser
import io
import json
import os
import platform
import re
import shutil
import socket
import subprocess
import time
from pathlib import Path

from PIL import Image, ImageDraw

try:
    import psutil
except ImportError:  # Minimal installs still serve fallback telemetry.
    psutil = None

DEFAULT_CUA = Path("/home/gustavo/.hermes/tools/cua-driver-0.21.0-linux-x64/cua-driver")


class LinuxBackend:
    def __init__(self, app_dirs=None, cua_driver: Path | None = None):
        self.app_dirs = [Path(p) for p in (app_dirs or self._default_app_dirs())]
        self.cua_driver = Path(cua_driver or os.environ.get("OMNIDECK_CUA_DRIVER", DEFAULT_CUA))
        self.crop_enabled = False
        self._cursor = [0.0, 0.0]
        self._last_frame_at = 0.0

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
                "capture": True,
                "input": self.cua_driver.is_file(),
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
        """Return best-effort focused-window geometry in desktop coordinates."""
        empty = {"title": "", "appId": None, "bbox": None}
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

    def launch_app(self, app_id: str):
        self._known_app(app_id)
        subprocess.Popen(["gtk-launch", app_id.removesuffix(".desktop")], shell=False, start_new_session=True)

    def focus_app(self, app_id: str):
        self._known_app(app_id)
        # cua-driver chooses the matching live window without shell interpolation.
        self._cua("bring_to_front", {"app": app_id.removesuffix(".desktop")})

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

    def _get_screen_dimensions(self) -> tuple[float, float]:
        if self.cua_driver and self.cua_driver.is_file():
            try:
                res = subprocess.run(
                    [str(self.cua_driver), "call", "get_screen_size", "{}"],
                    shell=False,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=2,
                )
                if res.returncode == 0:
                    data = self._json_object(res.stdout)
                    w = float(data.get("width", 0))
                    h = float(data.get("height", 0))
                    if w > 0 and h > 0:
                        return w, h
            except Exception:
                pass
        return 1920.0, 1080.0

    def _map_coordinates(self, payload: dict) -> list[float] | None:
        normalized_x = payload.get("normalizedX")
        normalized_y = payload.get("normalizedY")
        if normalized_x is None or normalized_y is None:
            return None
        nx = max(0.0, min(1.0, float(normalized_x)))
        ny = max(0.0, min(1.0, float(normalized_y)))
        active = self.get_active_window()
        bbox = active.get("bbox") if active else None
        if bbox:
            return [
                bbox["x"] + nx * bbox["width"],
                bbox["y"] + ny * bbox["height"],
            ]
        screen_w, screen_h = self._get_screen_dimensions()
        return [nx * screen_w, ny * screen_h]

    def handle_input(self, command: dict):
        kind = command.get("type")
        payload = command.get("payload") or {}
        if kind == "mouse-move":
            mapped = self._map_coordinates(payload)
            if mapped is not None:
                self._cursor = mapped
            else:
                self._cursor[0] = max(0, min(1000, self._cursor[0] + float(payload.get("dx", 0))))
                self._cursor[1] = max(0, min(1000, self._cursor[1] + float(payload.get("dy", 0))))
            self._cua("move_cursor", {"x": self._cursor[0], "y": self._cursor[1], "scope": "desktop"})
        elif kind == "mouse-click":
            if payload.get("pressed", True):
                mapped = self._map_coordinates(payload)
                if mapped is not None:
                    self._cursor = mapped
                tool = "right_click" if int(payload.get("button", 0)) == 2 else "click"
                self._cua(tool, {"x": self._cursor[0], "y": self._cursor[1]})
        elif kind == "mouse-scroll":
            amount = max(-20, min(20, int(float(payload.get("deltaY", 0)) / 20)))
            self._cua("scroll", {"amount": amount})
        elif kind in {"key-down", "key-up"}:
            key = str(payload.get("key", ""))[:32]
            if re.fullmatch(r"[A-Za-z0-9 F][A-Za-z0-9 _+-]{0,31}|Escape|Tab|Enter|Backspace|Arrow(Up|Down|Left|Right)|F([1-9]|1[0-2])", key):
                self._cua("press_key", {"key": key})
        # Gamepad data is accepted but ignored when no native virtual gamepad exists.

    def capture_frame(self):
        # ImageGrab works on X11. Wayland commonly denies it; return an explicit fallback frame.
        try:
            from PIL import ImageGrab
            image = ImageGrab.grab()
            if self.crop_enabled:
                width, height = image.size
                target_ratio = 20 / 9
                if width / height > target_ratio:
                    crop_width = int(height * target_ratio)
                    left = (width - crop_width) // 2
                    image = image.crop((left, 0, left + crop_width, height))
                else:
                    crop_height = int(width / target_ratio)
                    top = (height - crop_height) // 2
                    image = image.crop((0, top, width, top + crop_height))
        except Exception:
            image = Image.new("RGB", (1280, 720), (18, 20, 26))
            draw = ImageDraw.Draw(image)
            draw.text((40, 40), "OmniDeck capture unavailable", fill=(220, 225, 235))
            draw.text((40, 75), "Allow desktop capture or install a Wayland portal capture backend.", fill=(150, 160, 180))
        output = io.BytesIO()
        image.thumbnail((1280, 720))
        image.save(output, format="JPEG", quality=70, optimize=True)
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
