import json
from pathlib import Path

import pytest

from omnideck.backend import LinuxBackend


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


def test_cua_invocations_are_argument_arrays_and_input_is_bounded(monkeypatch):
    calls = []
    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda argv, **kw: calls.append((argv, kw)))
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))

    backend.handle_input({"type": "mouse-move", "payload": {"dx": 10**9, "dy": -10**9}})
    backend.handle_input({"type": "key-down", "payload": {"key": "A"}})

    assert all(call[1]["shell"] is False for call in calls)
    joined = " ".join(calls[0][0])
    assert "10000" not in joined
    assert "1000" in joined
    assert "/opt/cua-driver" == calls[0][0][0]


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


def test_normalized_coordinates_map_to_active_window_bbox(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    calls = []
    monkeypatch.setattr(backend, "get_active_window", lambda: {
        "title": "Editor",
        "appId": "code.desktop",
        "bbox": {"x": 100, "y": 50, "width": 1200, "height": 800},
    })
    monkeypatch.setattr(backend, "_cua", lambda tool, args: calls.append((tool, args)) or True)

    backend.handle_input({
        "type": "mouse-click",
        "payload": {"button": 0, "pressed": True, "normalizedX": 0.25, "normalizedY": 0.75},
    })

    assert calls == [("click", {"x": 400.0, "y": 650.0})]


def test_normalized_coordinates_without_bbox_fallback_to_desktop_dimensions(monkeypatch):
    backend = LinuxBackend(cua_driver=Path("/opt/cua-driver"))
    calls = []
    monkeypatch.setattr(backend, "get_active_window", lambda: {"title": "", "appId": None, "bbox": None})
    monkeypatch.setattr(backend, "_cua", lambda tool, args: calls.append((tool, args)) or True)

    backend.handle_input({
        "type": "mouse-move",
        "payload": {"normalizedX": 0.5, "normalizedY": 0.5},
    })

    assert calls == [("move_cursor", {"x": 960.0, "y": 540.0, "scope": "desktop"})]


def test_crop_uses_centered_20_by_9_aspect_ratio(monkeypatch):
    from PIL import Image

    source = Image.new("RGB", (2400, 1080), "black")
    monkeypatch.setattr("PIL.ImageGrab.grab", lambda: source)
    backend = LinuxBackend()
    backend.set_crop(True)

    frame = backend.capture_frame()

    from io import BytesIO
    result = Image.open(BytesIO(frame))
    assert result.width / result.height == pytest.approx(20 / 9, rel=0.01)


def test_capture_failure_returns_a_valid_jpeg(monkeypatch):
    monkeypatch.setattr("omnideck.backend.subprocess.run", lambda *a, **kw: (_ for _ in ()).throw(OSError("no capture")))
    backend = LinuxBackend()

    frame = backend.capture_frame()

    assert frame.startswith(b"\xff\xd8")
    assert frame.endswith(b"\xff\xd9")
