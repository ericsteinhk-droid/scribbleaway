"""
config.py — NMS Translator configuration: load, save, validate.

Config lives in %APPDATA%/NMSTranslator/config.json (Windows) or
~/.NMSTranslator/config.json (other platforms). Written once by the
first-run wizard in gui.py; never touched by end users directly.
"""
from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

APP_DIR = Path(os.environ.get("APPDATA", Path.home())) / "NMSTranslator"
CONFIG_FILE = APP_DIR / "config.json"
_WORK_SUBDIR = "nms_work"


@dataclass
class Config:
    api_key: str
    model: str
    lexicon_path: Path
    work_dir: Path

    def validate(self) -> list[str]:
        errors: list[str] = []
        if not self.api_key or not self.api_key.startswith("sk-ant-"):
            errors.append(
                "API key is missing or doesn't look right (expected sk-ant-…). "
                "Check Settings."
            )
        if not self.lexicon_path.exists():
            errors.append(f"Lexicon file not found: {self.lexicon_path}")
        return errors


def _find_lexicon_near_exe() -> Path | None:
    """
    Look for a lexicon .txt file next to the running exe or script.
    Preference order:
      1. Any .txt file whose name contains "lexicon" (case-insensitive)
      2. Any single .txt file present (if exactly one exists)
    Returns None if no unambiguous match is found.
    """
    if getattr(sys, "frozen", False):
        # PyInstaller one-file exe — search beside the exe
        app_dir = Path(sys.executable).parent
    else:
        # Script / run.bat — search beside gui.py / the entry script
        candidate = Path(sys.argv[0]).parent if sys.argv else Path.cwd()
        app_dir = candidate if candidate.is_dir() else Path.cwd()

    txt_files = list(app_dir.glob("*.txt"))
    named = [f for f in txt_files if "lexicon" in f.name.lower()]
    if named:
        return named[0]
    if len(txt_files) == 1:
        return txt_files[0]
    return None


def load() -> Config | None:
    """Return Config if config.json exists, None if first-run wizard is needed."""
    if not CONFIG_FILE.exists():
        return None
    with open(CONFIG_FILE, encoding="utf-8") as f:
        d = json.load(f)
    tmp = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp")))
    lexicon_path = Path(d.get("lexicon_path", ""))
    if not lexicon_path.exists():
        discovered = _find_lexicon_near_exe()
        if discovered:
            lexicon_path = discovered
    return Config(
        api_key=d.get("api_key", ""),
        model=d.get("model", "claude-sonnet-4-6"),
        lexicon_path=lexicon_path,
        work_dir=Path(d.get("work_dir", str(tmp / _WORK_SUBDIR))),
    )


def save(
    api_key: str,
    lexicon_path: str,
    model: str = "claude-sonnet-4-6",
    work_dir: str = "",
) -> None:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    tmp = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp")))
    d = {
        "api_key": api_key.strip(),
        "model": model,
        "lexicon_path": str(lexicon_path),
        "work_dir": work_dir or str(tmp / _WORK_SUBDIR),
    }
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(d, f, indent=2)
