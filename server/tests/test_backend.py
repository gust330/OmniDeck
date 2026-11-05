import json
from pathlib import Path

import pytest

from omnideck.backend import GnomeShellBridge, LinuxBackend


def test_gnome_shell_bridge_calls_dbus_and_parses_json(monkeypatch):
    bridge = GnomeShellBridge()
    commands = []

    class DummyCompleted:
        returncode = 0
        stdout = "('\"[{\\\\\"appId\\\\\": \\\\\"terminal.desktop\\\\\", \\\\\"focused\\\\\": true, \\\\\"bbox\\\\\": {\\\\\"x\\\\\": 10, \\\\\"y\\\\\": 20, \\\\\"width\\\\\": 800, \\\\\"height\\\\\": 600}}]\"',)\n"

    def fake_run(cmd, **kw):
        commands.append(cmd)
        return DummyCompleted()

    monkeypatch.setattr("omnideck.backend.subprocess.run", fake_run)

    windows = bridge.list_windows()

    assert commands[0] == [
        "gdbus", "call", "--session", "--dest", "io.github.omnideck.ShellBridge",
        "--object-path", "/io/github/omnideck/ShellBridge",
        "--method", "io.github.omnideck.ShellBridge.ListWindows",
    ]
    assert windows == [{
        "appId": "terminal.desktop",
        "focused": True,
        "bbox": {"x": 10, "y": 20, "width": 800, "height": 600},
    }]


def test_gnome_shell_bridge_raises_on_error(monkeypatch):
    bridge = GnomeShellBridge()

    class DummyFailed:
        returncode = 1
        stderr = "Error connecting: org.freedesktop.DBus.Error.ServiceUnknown\n"

    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda *a, **kw: DummyFailed())

    with pytest.raises(RuntimeError, match="Error connecting"):
        bridge.list_windows()


def test_desktop_files_are_parsed_and_deduplicated(tmp_path):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "code.desktop").write_text(
        "[Desktop Entry]\nName=Visual Studio Code\nExec=/usr/bin/code %F\nType=Application\n"
    )
    (apps_dir / "hidden.desktop").write_text(
        "[Desktop Entry]\nName=Hidden\nExec=hidden\nNoDisplay=true\nType=Application\n"
    )
    backend = LinuxBackend(app_dirs=[apps_dir])

    apps = backend.list_apps()

    assert apps == [{"id": "code.desktop", "name": "Visual Studio Code", "running": False}]


def test_focus_app_uses_shell_bridge_and_surfaces_missing_window(tmp_path):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "code.desktop").write_text(
        "[Desktop Entry]\nName=Code\nExec=code\nType=Application\n"
    )

    class Bridge:
        def activate(self, app_id):
            assert app_id == "code.desktop"
            return {"appId": app_id, "bbox": {"x": 1, "y": 2, "width": 3, "height": 4}}

    backend = LinuxBackend(app_dirs=[apps_dir], shell_bridge=Bridge())

    assert backend.focus_app("code.desktop")["appId"] == "code.desktop"
    assert backend.crop_enabled is True


def test_open_app_activates_existing_exact_desktop_window_and_enables_crop(tmp_path):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "code.desktop").write_text(
        "[Desktop Entry]\nName=Code\nExec=code\nType=Application\n"
    )

    class Bridge:
        def __init__(self):
            self.activated = []

        def list_windows(self):
            return [
                {"appId": "code-insiders.desktop", "title": "Wrong", "bbox": {"x": 0, "y": 0, "width": 20, "height": 20}},
                {"appId": "code.desktop", "title": "Project", "bbox": {"x": 11, "y": 22, "width": 900, "height": 700}},
            ]

        def activate(self, app_id):
            self.activated.append(app_id)
            return self.list_windows()[1]

    bridge = Bridge()
    backend = LinuxBackend(app_dirs=[apps_dir], shell_bridge=bridge)

    result = backend.open_app("code.desktop", timeout=0)

    assert bridge.activated == ["code.desktop"]
    assert backend.crop_enabled is True
    assert result == {
        "appId": "code.desktop",
        "title": "Project",
        "bbox": {"x": 11, "y": 22, "width": 900, "height": 700},
        "launched": False,
    }


def test_open_app_launches_then_waits_for_exact_window(tmp_path, monkeypatch):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "terminal.desktop").write_text(
        "[Desktop Entry]\nName=Terminal\nExec=gnome-terminal\nType=Application\n"
    )
    calls = []

    class Bridge:
        def __init__(self):
            self.poll = 0

        def list_windows(self):
            self.poll += 1
            if self.poll < 3:
                return []
            return [{"appId": "terminal.desktop", "title": "Terminal", "bbox": {"x": 4, "y": 5, "width": 800, "height": 600}}]

        def activate(self, app_id):
            calls.append(("activate", app_id))
            return self.list_windows()[0]

    monkeypatch.setattr("omnideck.backend.subprocess.Popen", lambda argv, **kw: calls.append(("launch", argv)))
    monkeypatch.setattr("omnideck.backend.time.sleep", lambda _: None)
    backend = LinuxBackend(app_dirs=[apps_dir], shell_bridge=Bridge())

    result = backend.open_app("terminal.desktop", timeout=1, poll_interval=0)

    assert calls == [("launch", ["gtk-launch", "terminal"]), ("activate", "terminal.desktop")]
    assert result["launched"] is True
    assert result["bbox"]["width"] == 800


def test_open_app_raises_timeout_if_window_does_not_appear(tmp_path, monkeypatch):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "terminal.desktop").write_text(
        "[Desktop Entry]\nName=Terminal\nExec=gnome-terminal\nType=Application\n"
    )

    class Bridge:
        def list_windows(self):
            return []

        def activate(self, app_id):
            return None

    monkeypatch.setattr("omnideck.backend.subprocess.Popen", lambda argv, **kw: None)
    monkeypatch.setattr("omnideck.backend.time.sleep", lambda _: None)
    backend = LinuxBackend(app_dirs=[apps_dir], shell_bridge=Bridge())

    with pytest.raises(TimeoutError, match="Window for terminal.desktop did not appear"):
        backend.open_app("terminal.desktop", timeout=0.1, poll_interval=0.01)


def test_launch_uses_validated_desktop_id_without_shell(tmp_path, monkeypatch):
    apps_dir = tmp_path / "applications"
    apps_dir.mkdir()
    (apps_dir / "terminal.desktop").write_text(
        "[Desktop Entry]\nName=Terminal\nExec=gnome-terminal\nType=Application\n"
    )
    calls = []
    monkeypatch.setattr("omnideck.backend.subprocess.Popen", lambda argv, **kw: calls.append((argv, kw)))
    backend = LinuxBackend(app_dirs=[apps_dir])

    backend.launch_app("terminal.desktop")

    assert calls[0][0] == ["gtk-launch", "terminal"]
    assert calls[0][1]["shell"] is False


def test_vnc_input_is_bounded_and_preserves_key_transitions(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    def discard(coro, timeout=10):
        coro.close()
    monkeypatch.setattr(backend, "_run_vnc", discard)

    backend.handle_input({"type": "mouse-move", "payload": {"dx": 10**9, "dy": -10**9}})
    assert backend._cursor == [1919.0, 0]

    actions = []
    def capture(coro, timeout=10):
        actions.append(coro.cr_frame.f_locals["action"])
        coro.close()
    monkeypatch.setattr(backend, "_run_vnc", capture)
    backend.handle_input({"type": "key-down", "payload": {"key": "A"}})
    backend.handle_input({"type": "key-up", "payload": {"key": "A"}})
    assert actions == ["key", "key"]


def test_get_active_window_parses_cua_driver_window_list(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    payload = {
        "windows": [
            {
                "title": "Code - OmniDeck",
                "appId": "code.desktop",
                "focused": True,
                "bounds": {"x": 120, "y": 80, "width": 1400, "height": 900},
            },
            {
                "title": "Terminal",
                "appId": "terminal.desktop",
                "focused": False,
                "bounds": {"x": 0, "y": 0, "width": 800, "height": 600},
            },
        ]
    }

    class DummyCompleted:
        returncode = 0
        stdout = json.dumps(payload)

    monkeypatch.setattr(Path, "is_file", lambda self: True)
    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda *a, **kw: DummyCompleted())

    active = backend.get_active_window()

    assert active == {
        "title": "Code - OmniDeck",
        "appId": "code.desktop",
        "bbox": {"x": 120.0, "y": 80.0, "width": 1400.0, "height": 900.0},
    }


def test_get_active_window_handles_leading_warnings_in_cua_driver_output(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    payload = {
        "windows": [
            {
                "title": "Terminal",
                "appId": "terminal.desktop",
                "focused": True,
                "bounds": {"x": 50, "y": 60, "width": 900, "height": 700},
            }
        ]
    }

    class DummyCompleted:
        returncode = 0
        stdout = "Wayland clipboard init failed, falling back to X11: ...\n" + json.dumps(payload)

    monkeypatch.setattr(Path, "is_file", lambda self: True)
    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda *a, **kw: DummyCompleted())

    active = backend.get_active_window()
    assert active["title"] == "Terminal"
    assert active["bbox"] == {"x": 50.0, "y": 60.0, "width": 900.0, "height": 700.0}


def test_status_reports_metrics_active_window_and_running_apps(monkeypatch):
    backend = LinuxBackend(app_dirs=[])
    monkeypatch.setattr(backend, "get_telemetry", lambda: {"cpu": 22.0, "ram": 44.0, "fps": 30})
    monkeypatch.setattr(backend, "get_active_window", lambda: {
        "title": "Editor",
        "appId": "code.desktop",
        "bbox": {"x": 100, "y": 50, "width": 1200, "height": 800},
    })
    monkeypatch.setattr(backend, "list_apps", lambda: [
        {"id": "code.desktop", "name": "Code", "running": True},
        {"id": "firefox.desktop", "name": "Firefox", "running": False},
    ])

    status = backend.get_status()

    assert status["metrics"]["cpu"] == 22.0
    assert status["activeWindow"]["bbox"]["x"] == 100
    assert status["runningApps"] == [{"id": "code.desktop", "name": "Code", "running": True}]


def test_normalized_coordinates_map_to_current_frame_crop(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    backend._frame_rect = (100, 50, 1200, 800)
    calls = []
    def capture(coro, timeout=10):
        frame = coro.cr_frame
        calls.append((frame.f_locals["action"], frame.f_locals["payload"]))
        coro.close()
    monkeypatch.setattr(backend, "_run_vnc", capture)

    backend.handle_input({
        "type": "mouse-click",
        "payload": {"button": 0, "pressed": True, "normalizedX": 0.25, "normalizedY": 0.75},
    })

    assert calls[0] == ("move", {"x": 400, "y": 650})
    assert calls[1] == ("button", {"button": 0, "pressed": True})


def test_normalized_coordinates_map_to_integer_pixels_with_clamped_edges():
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    backend._frame_rect = (100, 50, 1200, 800)

    assert backend._map_coordinates({"normalizedX": 0.25, "normalizedY": 0.75}) == [400, 650]
    assert backend._map_coordinates({"normalizedX": -1, "normalizedY": 2}) == [100, 849]


def test_normalized_coordinates_without_bbox_fallback_to_desktop_dimensions(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    backend._frame_rect = (0, 0, 1920, 1080)
    calls = []
    def capture(coro, timeout=10):
        frame = coro.cr_frame
        calls.append((frame.f_locals["action"], frame.f_locals["payload"]))
        coro.close()
    monkeypatch.setattr(backend, "_run_vnc", capture)

    backend.handle_input({
        "type": "mouse-move",
        "payload": {"normalizedX": 0.5, "normalizedY": 0.5},
    })

    assert calls == [("move", {"x": 960, "y": 540})]


def test_crop_uses_centered_20_by_9_aspect_ratio(monkeypatch):
    import numpy as np

    arr = np.zeros((1080, 2400, 4), dtype=np.uint8)
    backend = LinuxBackend()
    backend.set_crop(True)
    monkeypatch.setattr(backend, "get_active_window", lambda: {"bbox": None})
    monkeypatch.setattr(backend, "_run_vnc", lambda coro, timeout=15: (coro.close(), arr)[1])

    frame = backend.capture_frame()

    from io import BytesIO
    from PIL import Image
    result = Image.open(BytesIO(frame))
    assert result.width / result.height == pytest.approx(20 / 9, rel=0.01)


def test_capture_failure_returns_a_valid_jpeg(monkeypatch):
    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda *a, **kw: (_ for _ in ()).throw(OSError("no capture")))
    backend = LinuxBackend()

    frame = backend.capture_frame()

    assert frame.startswith(b"\xff\xd8")
    assert frame.endswith(b"\xff\xd9")
