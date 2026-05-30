"""
config.py — NMS Translator configuration: load, save, validate.

Config lives in %APPDATA%/NMSTranslator/config.json (Windows) or
~/.NMSTranslator/config.json (other platforms). Written once by the
first-run wizard in gui.py; never touched by end users directly.
"""
from __future__ import annotations

import json
import os
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


def load() -> Config | None:
    """Return Config if config.json exists, None if first-run wizard is needed."""
    if not CONFIG_FILE.exists():
        return None
    with open(CONFIG_FILE, encoding="utf-8") as f:
        d = json.load(f)
    tmp = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp")))
    return Config(
        api_key=d.get("api_key", ""),
        model=d.get("model", "claude-sonnet-4-6"),
        lexicon_path=Path(d.get("lexicon_path", "")),
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
