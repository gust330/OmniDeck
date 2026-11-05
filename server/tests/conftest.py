import pytest


class FakeSystemBackend:
    def __init__(self):
        self.host = "test-host"
        self.platform = "linux"
        self.session = "wayland"
        self.apps = []
        self.actions = []
        self.volume = 50
        self.power_actions = []
        self.frame = b"\xff\xd8fake-frame\xff\xd9"
        self.telemetry = {"fps": 60, "ping": 2.0}
        self.inputs = []
        self.crop_enabled = False
        self.status = {
            "status": "ok",
            "host": self.host,
            "platform": self.platform,
            "session": self.session,
            "capabilities": {
                "capture": True,
                "input": True,
                "volume": True,
                "power": True,
            },
        }

    def get_status(self):
        return self.status

    def list_apps(self):
        return self.apps

    def launch_app(self, app_id):
        self.actions.append(("launch", app_id))

    def focus_app(self, app_id):
        self.actions.append(("focus", app_id))

    def open_app(self, app_id):
        self.actions.append(("open", app_id))
        self.crop_enabled = True
        return {
            "appId": app_id,
            "title": "Code",
            "bbox": {"x": 10, "y": 20, "width": 800, "height": 600},
            "launched": True,
        }

    def set_volume(self, level):
        self.volume = level

    def power(self, action):
        self.power_actions.append(action)

    def capture_frame(self):
        return self.frame

    def get_telemetry(self):
        return self.telemetry

    def handle_input(self, command):
        self.inputs.append(command)


@pytest.fixture
def fake_backend():
    return FakeSystemBackend()
