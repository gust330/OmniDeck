#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH:-}"

HOST="${OMNIDECK_HOST:-${HOST:-0.0.0.0}}"
PORT="${OMNIDECK_PORT:-${PORT:-8080}}"

# Use local virtualenv if present, or automatically create it
if [ ! -f "${SCRIPT_DIR}/.venv/bin/python" ]; then
    echo "OmniDeck: Setting up local virtualenv in ${SCRIPT_DIR}/.venv..."
    if command -v python3 >/dev/null 2>&1; then
        python3 -m venv "${SCRIPT_DIR}/.venv"
    else
        python -m venv "${SCRIPT_DIR}/.venv"
    fi
    "${SCRIPT_DIR}/.venv/bin/pip" install --quiet -r "${SCRIPT_DIR}/requirements.txt"
fi

PYTHON="${SCRIPT_DIR}/.venv/bin/python"

# Verify uvicorn is available in python
if ! "${PYTHON}" -c "import uvicorn" >/dev/null 2>&1; then
    echo "OmniDeck: Installing missing dependencies into .venv..."
    "${SCRIPT_DIR}/.venv/bin/pip" install --quiet -r "${SCRIPT_DIR}/requirements.txt"
fi

# Verify that the desktop control services are reachable before exposing the API.
VNC_HOST="${OMNIDECK_VNC_HOST:-127.0.0.1}"
VNC_PORT="${OMNIDECK_VNC_PORT:-5900}"
VNC_PASSWORD="${OMNIDECK_VNC_PASSWORD:-omnideck}"
if ! VNC_HOST="$VNC_HOST" VNC_PORT="$VNC_PORT" VNC_PASSWORD="$VNC_PASSWORD" "${PYTHON}" -c 'import asyncio, os, asyncvnc
async def check():
    async with asyncvnc.connect(os.environ["VNC_HOST"], int(os.environ["VNC_PORT"]), password=os.environ["VNC_PASSWORD"]) as client:
        if client.video.width <= 0 or client.video.height <= 0:
            raise RuntimeError("invalid VNC framebuffer")
asyncio.run(asyncio.wait_for(check(), timeout=5))' >/dev/null 2>&1; then
    echo "OmniDeck: VNC is not ready at ${VNC_HOST}:${VNC_PORT} (check GNOME Remote Desktop and password)." >&2
    exit 1
fi

CUA_DRIVER="${OMNIDECK_CUA_DRIVER:-/home/gustavo/.hermes/tools/cua-driver-0.21.0-linux-x64/cua-driver}"
if [ ! -x "$CUA_DRIVER" ]; then
    echo "OmniDeck: warning: cua-driver is unavailable; app window focus/crop discovery will be limited." >&2
fi

echo "Starting OmniDeck Host Server on ${HOST}:${PORT} using ${PYTHON}..."
exec "${PYTHON}" -m uvicorn omnideck.main:app --host "${HOST}" --port "${PORT}" "$@"
