"""Executable OmniDeck host-server entrypoint."""

from omnideck.main import app, main

__all__ = ["app", "main"]


if __name__ == "__main__":
    main()
