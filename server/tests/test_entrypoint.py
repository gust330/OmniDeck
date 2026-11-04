import importlib
import os
import sys
from pathlib import Path


def test_server_main_entrypoint_exists_and_exposes_app():
    server_dir = Path(__file__).resolve().parent.parent
    main_py = server_dir / "main.py"
    assert main_py.exists(), "server/main.py entrypoint must exist"

    # Verify server.main can be imported and exposes the FastAPI app
    if str(server_dir) not in sys.path:
        sys.path.insert(0, str(server_dir))
    main_module = importlib.import_module("main")
    assert hasattr(main_module, "app")
    assert hasattr(main_module, "main")


def test_default_port_is_8080_when_env_not_set(monkeypatch):
    server_dir = Path(__file__).resolve().parent.parent
    if str(server_dir) not in sys.path:
        sys.path.insert(0, str(server_dir))

    monkeypatch.delenv("OMNIDECK_PORT", raising=False)
    monkeypatch.delenv("PORT", raising=False)

    import omnideck.main as omnideck_main

    # Build parser or check default
    parser = omnideck_main.build_parser() if hasattr(omnideck_main, "build_parser") else None
    if parser:
        args = parser.parse_args([])
        assert args.port == 8080
    else:
        # If no build_parser helper, check parser default directly or inspect
        assert False, "omnideck.main must provide build_parser() or default port 8080"
