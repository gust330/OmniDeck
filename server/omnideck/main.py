import asyncio
import json
import os
from typing import Literal

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from omnideck.backend import LinuxBackend
from omnideck.inputs import InputMessage


class VolumeRequest(BaseModel):
    level: int | None = None
    volume: int | None = None


class PowerRequest(BaseModel):
    action: Literal["lock", "suspend", "shutdown", "reboot"]


class FocusRequest(BaseModel):
    appId: str | None = None
    app_id: str | None = None

    def target_app(self) -> str | None:
        return self.appId or self.app_id


class LaunchRequest(BaseModel):
    appId: str | None = None
    app_id: str | None = None

    def target_app(self) -> str | None:
        return self.appId or self.app_id


class CropRequest(BaseModel):
    enabled: bool


def create_app(
    backend,
    frame_interval: float | None = None,
    telemetry_interval: float | None = None,
) -> FastAPI:
    app = FastAPI(title="OmniDeck Host", version="1.0.0")
    app.state.backend = backend

    fps = float(os.environ.get("OMNIDECK_FPS", "30"))
    default_frame_interval = 1.0 / max(1.0, fps) if frame_interval is None else frame_interval
    default_telemetry_interval = (
        float(os.environ.get("OMNIDECK_TELEMETRY_INTERVAL", "0.25"))
        if telemetry_interval is None
        else telemetry_interval
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_apps_list():
        return backend.list_apps()

    def find_app(app_id: str):
        apps = get_apps_list()
        for item in apps:
            if item.get("id") == app_id:
                return item
        return None

    def require_app(app_id: str):
        if not find_app(app_id):
            raise HTTPException(status_code=404, detail="Unknown application")

    @app.get("/status")
    @app.get("/api/status")
    async def status():
        return backend.get_status()

    @app.get("/apps")
    @app.get("/api/apps")
    async def apps():
        return {"apps": get_apps_list()}

    @app.post("/apps/{app_id}/launch")
    async def launch(app_id: str):
        require_app(app_id)
        backend.launch_app(app_id)
        return {"ok": True, "action": "launch", "app_id": app_id}

    @app.post("/api/apps/launch")
    async def api_apps_launch(request: LaunchRequest):
        target = request.target_app()
        if not target:
            raise HTTPException(status_code=400, detail="appId or app_id required")
        require_app(target)
        backend.launch_app(target)
        return {"ok": True, "action": "launch", "app_id": target}

    @app.post("/apps/{app_id}/focus")
    async def focus_path(app_id: str):
        require_app(app_id)
        backend.focus_app(app_id)
        return {"ok": True, "action": "focus", "app_id": app_id}

    @app.post("/api/focus")
    @app.post("/api/apps/focus")
    async def focus_body(request: FocusRequest):
        target = request.target_app()
        if not target:
            raise HTTPException(status_code=400, detail="appId or app_id required")
        require_app(target)
        backend.focus_app(target)
        return {"ok": True, "action": "focus", "app_id": target}

    @app.put("/system/volume")
    @app.post("/api/volume")
    @app.post("/api/system/volume")
    async def set_system_volume(request: VolumeRequest):
        val = request.level if request.level is not None else request.volume
        if val is None:
            raise HTTPException(status_code=400, detail="Volume level required")
        clamped = max(0, min(100, val))
        backend.set_volume(clamped)
        return {"ok": True, "level": clamped}

    @app.post("/system/power")
    @app.post("/api/power")
    @app.post("/api/system/power")
    async def system_power(request: PowerRequest):
        backend.power(request.action)
        return {"ok": True, "action": request.action}

    @app.post("/api/crop")
    async def system_crop(request: CropRequest):
        if hasattr(backend, "set_crop"):
            backend.set_crop(request.enabled)
        return {"ok": True, "enabled": request.enabled}

    async def stream_endpoint(websocket: WebSocket):
        await websocket.accept()
        send_lock = asyncio.Lock()

        async def send_frame_loop():
            while True:
                frame = await asyncio.to_thread(backend.capture_frame)
                if frame:
                    async with send_lock:
                        await websocket.send_bytes(frame)
                await asyncio.sleep(default_frame_interval)

        async def send_telemetry_loop():
            while True:
                telemetry = await asyncio.to_thread(backend.get_telemetry)
                if telemetry:
                    async with send_lock:
                        await websocket.send_json({"type": "telemetry", "data": telemetry})
                await asyncio.sleep(default_telemetry_interval)

        async def receive_input_loop():
            while True:
                text_data = await websocket.receive_text()
                try:
                    payload = json.loads(text_data)
                except (json.JSONDecodeError, TypeError):
                    async with send_lock:
                        await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                    continue

                try:
                    msg = InputMessage.model_validate(payload)
                except Exception as exc:
                    async with send_lock:
                        await websocket.send_json({"type": "error", "message": f"Invalid command: {exc}"})
                    continue

                await asyncio.to_thread(backend.handle_input, msg.data.model_dump())
                async with send_lock:
                    await websocket.send_json({"type": "ack", "command": msg.data.type})

        tasks = [
            asyncio.create_task(send_frame_loop()),
            asyncio.create_task(send_telemetry_loop()),
            asyncio.create_task(receive_input_loop()),
        ]
        try:
            done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                if not task.cancelled():
                    task.result()
        except WebSocketDisconnect:
            pass
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

    @app.websocket("/ws/stream")
    async def ws_stream(websocket: WebSocket):
        await stream_endpoint(websocket)

    @app.websocket("/ws")
    async def ws_alias(websocket: WebSocket):
        await stream_endpoint(websocket)

    return app


app = create_app(LinuxBackend())


def build_parser():
    import argparse

    parser = argparse.ArgumentParser(description="OmniDeck Host Server")
    parser.add_argument("--host", default=os.environ.get("OMNIDECK_HOST", "0.0.0.0"), help="Host to bind")
    parser.add_argument("--port", type=int, default=int(os.environ.get("OMNIDECK_PORT", 8080)), help="Port to bind")
    return parser


def main():
    import uvicorn

    args = build_parser().parse_args()
    uvicorn.run("omnideck.main:app", host=args.host, port=args.port, reload=False)


if __name__ == "__main__":
    main()
