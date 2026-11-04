from fastapi.testclient import TestClient

from omnideck.main import app, create_app
from omnideck.backend import LinuxBackend


def test_default_app_has_linux_backend():
    assert isinstance(app.state.backend, LinuxBackend)
    client = TestClient(app)
    response = client.get("/status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_api_compatibility_routes_match_frontend_expectations(fake_backend):
    fake_backend.apps = [{"id": "code.desktop", "name": "Code", "running": False}]
    client = TestClient(create_app(fake_backend))

    # /api/apps
    apps = client.get("/api/apps")
    assert apps.status_code == 200
    assert apps.json() == {"apps": [{"id": "code.desktop", "name": "Code", "running": False}]}

    # /api/focus with body {"appId": "code.desktop"}
    focus = client.post("/api/focus", json={"appId": "code.desktop"})
    assert focus.status_code == 200

    # /api/volume with body {"volume": 42}
    vol = client.post("/api/volume", json={"volume": 42})
    assert vol.status_code == 200
    assert fake_backend.volume == 42

    # /api/power with body {"action": "suspend"}
    power = client.post("/api/power", json={"action": "suspend"})
    assert power.status_code == 200
    assert "suspend" in fake_backend.power_actions

    # /api/crop with body {"enabled": True}
    crop = client.post("/api/crop", json={"enabled": True})
    assert crop.status_code == 200


def test_exact_required_post_routes_integration(fake_backend):
    fake_backend.apps = [{"id": "code.desktop", "name": "Code", "running": True}]
    fake_backend.status["runningApps"] = fake_backend.apps
    fake_backend.status["activeWindow"] = {
        "title": "Code",
        "appId": "code.desktop",
        "bbox": {"x": 0, "y": 0, "width": 1920, "height": 1080},
    }
    fake_backend.status["metrics"] = {"cpu": 15.0, "ram": 45.0, "fps": 30}
    client = TestClient(create_app(fake_backend))

    # Exact required POST routes
    launch_res = client.post("/api/apps/launch", json={"appId": "code.desktop"})
    assert launch_res.status_code == 200
    assert launch_res.json()["ok"] is True

    focus_res = client.post("/api/apps/focus", json={"appId": "code.desktop"})
    assert focus_res.status_code == 200
    assert focus_res.json()["ok"] is True

    vol_res = client.post("/api/system/volume", json={"volume": 65})
    assert vol_res.status_code == 200
    assert vol_res.json() == {"ok": True, "level": 65}
    assert fake_backend.volume == 65

    pwr_res = client.post("/api/system/power", json={"action": "lock"})
    assert pwr_res.status_code == 200
    assert pwr_res.json() == {"ok": True, "action": "lock"}
    assert fake_backend.power_actions == ["lock"]

    # Status contract
    status = client.get("/api/status").json()
    assert "metrics" in status and status["metrics"]["fps"] == 30
    assert "activeWindow" in status and status["activeWindow"]["title"] == "Code"
    assert "runningApps" in status and len(status["runningApps"]) == 1
