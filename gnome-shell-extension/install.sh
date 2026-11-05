#!/usr/bin/env bash
set -euo pipefail

UUID='omnideck-shell-bridge@omnideck.local'
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/.local/share/gnome-shell/extensions/$UUID"

mkdir -p "$TARGET"
install -m 0644 "$SOURCE/metadata.json" "$TARGET/metadata.json"
install -m 0644 "$SOURCE/extension.js" "$TARGET/extension.js"

gnome-extensions disable "$UUID" >/dev/null 2>&1 || true
if ! gnome-extensions enable "$UUID"; then
    printf '%s\n' "Installed $UUID; log out and back in, then run: gnome-extensions enable $UUID" >&2
    exit 2
fi
printf '%s\n' "Installed and enabled $UUID"
