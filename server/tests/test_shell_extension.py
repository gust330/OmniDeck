import json
from pathlib import Path


ROOT = Path(__file__).parents[2]
EXTENSION = ROOT / "gnome-shell-extension"


def test_extension_metadata_supports_current_shell():
    metadata = json.loads((EXTENSION / "metadata.json").read_text())
    assert metadata["uuid"] == "omnideck-shell-bridge@omnideck.local"
    assert "50" in metadata["shell-version"]


def test_extension_exports_narrow_window_bridge():
    source = (EXTENSION / "extension.js").read_text()
    assert "ListWindows" in source
    assert "Activate" in source
    assert "global.get_window_actors()" in source
    assert "get_frame_rect()" in source
    assert "activate(global.get_current_time())" in source


def test_installer_targets_user_extension_directory():
    source = (EXTENSION / "install.sh").read_text()
    assert "$HOME/.local/share/gnome-shell/extensions" in source
    assert "gnome-extensions enable" in source
