#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PYTHONPATH="${SCRIPT_DIR}:${PYTHONPATH:-}"

HOST="${OMNIDECK_HOST:-${HOST:-0.0.0.0}}"
PORT="${OMNIDECK_PORT:-${PORT:-8080}}"

if [ -f "${SCRIPT_DIR}/.venv/bin/python" ]; then
    PYTHON="${SCRIPT_DIR}/.venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON="$(command -v python3)"
else
    PYTHON="$(command -v python)"
fi

echo "Starting OmniDeck Host Server on ${HOST}:${PORT} using ${PYTHON}..."
exec "${PYTHON}" -m uvicorn omnideck.main:app --host "${HOST}" --port "${PORT}" "$@"
