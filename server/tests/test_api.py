from fastapi.testclient import TestClient

from omnideck.main import create_app


def test_status_reports_host_and_backend_capabilities(fake_backend):
    client = TestClient(create_app(fake_backend))

    response = client.get("/status")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "host": "test-host",
        "platform": "linux",
        "session": "wayland",
        "capabilities": {
            "capture": True,
            "input": True,
            "volume": True,
            "power": True,
        },
    }


def test_status_includes_metrics_active_window_and_running_apps(fake_backend):
    fake_backend.status.update({
        "metrics": {"cpu": 12.5, "ram": 33.0},
        "activeWindow": {"title": "Terminal", "appId": "terminal.desktop", "bbox": {"x": 10, "y": 20, "width": 800, "height": 600}},
        "runningApps": [{"id": "terminal.desktop", "name": "Terminal", "running": True}],
    })
    client = TestClient(create_app(fake_backend))

    payload = client.get("/api/status").json()

    assert payload["metrics"]["cpu"] == 12.5
    assert payload["activeWindow"]["bbox"]["width"] == 800
    assert payload["runningApps"][0]["id"] == "terminal.desktop"


def test_apps_endpoint_lists_desktop_applications(fake_backend):
    fake_backend.apps = [
        {"id": "org.gnome.Terminal.desktop", "name": "Terminal", "running": True},
        {"id": "firefox.desktop", "name": "Firefox", "running": False},
    ]
    client = TestClient(create_app(fake_backend))

    response = client.get("/apps")

    assert response.status_code == 200
    assert response.json() == {"apps": fake_backend.apps}


def test_launch_and_focus_reject_unknown_application_ids(fake_backend):
    client = TestClient(create_app(fake_backend))

    assert client.post("/apps/missing.desktop/launch").status_code == 404
    assert client.post("/apps/missing.desktop/focus").status_code == 404


def test_launch_and_focus_delegate_validated_application(fake_backend):
    fake_backend.apps = [
        {"id": "org.gnome.Terminal.desktop", "name": "Terminal", "running": False}
    ]
    client = TestClient(create_app(fake_backend))

    launch = client.post("/apps/org.gnome.Terminal.desktop/launch")
    focus = client.post("/apps/org.gnome.Terminal.desktop/focus")

    assert launch.json() == {"ok": True, "action": "launch", "app_id": "org.gnome.Terminal.desktop"}
    assert focus.json() == {"ok": True, "action": "focus", "app_id": "org.gnome.Terminal.desktop"}
    assert fake_backend.actions == [
        ("launch", "org.gnome.Terminal.desktop"),
        ("focus", "org.gnome.Terminal.desktop"),
    ]


def test_volume_is_clamped_and_power_action_is_allowlisted(fake_backend):
    client = TestClient(create_app(fake_backend))

    volume = client.put("/system/volume", json={"level": 140})
    bad_power = client.post("/system/power", json={"action": "format-disk"})
    suspend = client.post("/system/power", json={"action": "suspend"})

    assert volume.json() == {"ok": True, "level": 100}
    assert fake_backend.volume == 100
    assert bad_power.status_code == 422
    assert suspend.json() == {"ok": True, "action": "suspend"}
    assert fake_backend.power_actions == ["suspend"]


def test_exact_host_api_routes_delegate_expected_payloads(fake_backend):
    fake_backend.apps = [{"id": "code.desktop", "name": "Code", "running": False}]
    client = TestClient(create_app(fake_backend))

    assert client.post("/api/apps/launch", json={"appId": "code.desktop"}).status_code == 200
    assert client.post("/api/apps/focus", json={"appId": "code.desktop"}).status_code == 200
    assert client.post("/api/system/volume", json={"volume": 37}).status_code == 200
    assert client.post("/api/system/power", json={"action": "reboot"}).status_code == 200
    assert fake_backend.actions == [("launch", "code.desktop"), ("focus", "code.desktop")]
    assert fake_backend.volume == 37
    assert fake_backend.power_actions == ["reboot"]


def test_exact_host_api_routes_validate_input_safely(fake_backend):
    fake_backend.apps = [{"id": "code.desktop", "name": "Code", "running": False}]
    client = TestClient(create_app(fake_backend))

    # Missing target
    assert client.post("/api/apps/launch", json={}).status_code == 400
    assert client.post("/api/apps/focus", json={}).status_code == 400
    # Unknown application
    assert client.post("/api/apps/launch", json={"appId": "unknown.desktop"}).status_code == 404
    assert client.post("/api/apps/focus", json={"appId": "unknown.desktop"}).status_code == 404
    # Missing volume
    assert client.post("/api/system/volume", json={}).status_code == 400
    # Invalid power action
    assert client.post("/api/system/power", json={"action": "explode"}).status_code == 422


def test_cors_headers_are_present(fake_backend):
    client = TestClient(create_app(fake_backend))
    response = client.options("/status", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert response.headers.get("access-control-allow-origin") in ("*", "http://localhost:5173")
