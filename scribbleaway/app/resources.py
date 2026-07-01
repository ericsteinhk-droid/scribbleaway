"""Locate bundled assets in both source and PyInstaller-frozen runs."""

import os
import sys

# EVOQ logo, relative to the project root / bundle root.
LOGO_REL = "app/assets/evoq_logo.png"


def resource_path(rel: str) -> str:
    """Absolute path to a bundled resource.

    When frozen by PyInstaller, data files live under ``sys._MEIPASS``;
    otherwise they sit relative to the project root (the parent of ``app/``).
    """
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, rel)


def logo_path() -> str:
    return resource_path(LOGO_REL)
