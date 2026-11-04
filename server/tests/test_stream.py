import json

from fastapi.testclient import TestClient

from omnideck.main import create_app


def test_stream_sends_jpeg_frame_and_telemetry(fake_backend):
    fake_backend.frame = b"\xff\xd8jpeg\xff\xd9"
    fake_backend.telemetry = {"cpu": 12.5, "ram": 33.0, "fps": 30}
    client = TestClient(create_app(fake_backend))

    with client.websocket_connect("/ws/stream") as socket:
        assert socket.receive_bytes() == fake_backend.frame
        assert socket.receive_json() == {"type": "telemetry", "data": fake_backend.telemetry}


def test_stream_accepts_valid_input_and_acknowledges(fake_backend):
    client = TestClient(create_app(fake_backend))
    message = {
        "type": "input",
        "data": {
            "type": "mouse-move",
            "payload": {"dx": 3, "dy": -2},
            "timestamp": 5,
        },
    }

    with client.websocket_connect("/ws/stream") as socket:
        socket.receive_bytes()
        socket.receive_json()
        socket.send_text(json.dumps(message))
        assert socket.receive_json() == {"type": "ack", "command": "mouse-move"}

    assert fake_backend.inputs == [message["data"]]


def test_stream_continuously_sends_frames_and_telemetry_concurrently(fake_backend):
    fake_backend.frame = b"\xff\xd8frame\xff\xd9"
    fake_backend.telemetry = {"cpu": 10.0, "ram": 20.0, "fps": 30}
    # Set fast intervals for testing if configurable, or test that multiple frames/telemetry arrive
    app = create_app(fake_backend, frame_interval=0.01, telemetry_interval=0.02)
    client = TestClient(app)

    with client.websocket_connect("/ws/stream") as socket:
        frames_received = 0
        telemetry_received = 0
        acks_received = 0

        # Concurrently send an input while receiving continuous stream data
        socket.send_json({"type": "input", "data": {"type": "mouse-click", "payload": {"button": 0}}})

        for _ in range(8):
            raw = socket.receive()
            if "bytes" in raw and raw["bytes"]:
                frames_received += 1
            elif "text" in raw and raw["text"]:
                msg = json.loads(raw["text"])
                if msg.get("type") == "telemetry":
                    telemetry_received += 1
                elif msg.get("type") == "ack":
                    acks_received += 1

        assert frames_received >= 2, f"Expected multiple frames, got {frames_received}"
        assert telemetry_received >= 1, f"Expected telemetry, got {telemetry_received}"
        assert acks_received == 1, f"Expected ack for concurrent input, got {acks_received}"


def test_stream_rejects_malformed_and_unknown_input(fake_backend):
    client = TestClient(create_app(fake_backend))

    with client.websocket_connect("/ws/stream") as socket:
        socket.receive_bytes()
        socket.receive_json()
        socket.send_text("not-json")
        assert socket.receive_json()["type"] == "error"
        socket.send_json({"type": "input", "data": {"type": "shell", "payload": {}}})
        assert socket.receive_json()["type"] == "error"

    assert fake_backend.inputs == []

