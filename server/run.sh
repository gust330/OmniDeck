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

echo "Starting OmniDeck Host Server on ${HOST}:${PORT} using ${PYTHON}..."
exec "${PYTHON}" -m uvicorn omnideck.main:app --host "${HOST}" --port "${PORT}" "$@"
