"""PyInstaller entry point.

Kept at the project root so the ``app`` package resolves cleanly when frozen.
Running ``python run.py`` is equivalent to ``python -m app.main``.
"""

from app.main import main

if __name__ == "__main__":
    main()
