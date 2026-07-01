"""Local storage for the Gemini API key.

Primary backend is the OS credential store via ``keyring`` (Windows Credential
Manager on Windows). If no keyring backend is available (e.g. a headless Linux
CI box), we fall back to a per-user JSON config file. The key is never
hardcoded, never committed, and never baked into the packaged exe.
"""

import json
import os
from pathlib import Path

SERVICE_NAME = "ScribbleAway"
ACCOUNT_NAME = "gemini_api_key"

try:
    import keyring
    from keyring.errors import KeyringError
    _HAVE_KEYRING = True
except Exception:  # pragma: no cover - keyring not installed
    keyring = None
    KeyringError = Exception
    _HAVE_KEYRING = False


def _config_dir() -> Path:
    """Per-user config directory used only for the file fallback."""
    if os.name == "nt":
        base = os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")
    else:
        base = os.environ.get("XDG_CONFIG_HOME") or (Path.home() / ".config")
    d = Path(base) / SERVICE_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


def _config_file() -> Path:
    return _config_dir() / "config.json"


def _keyring_usable() -> bool:
    if not _HAVE_KEYRING:
        return False
    try:
        # A null/fail backend raises or is a known unusable class. Catch
        # BaseException too: a broken native backend can raise a Rust
        # PanicException (subclass of BaseException) during detection, and we
        # must still fall back to the file store rather than crash.
        backend = keyring.get_keyring()
        name = backend.__class__.__name__.lower()
        return "fail" not in name and "null" not in name
    except BaseException:
        return False


def backend_name() -> str:
    """Human-readable description of where the key is stored."""
    if _keyring_usable():
        try:
            return keyring.get_keyring().__class__.__name__
        except Exception:
            pass
    return f"config file ({_config_file()})"


def save_key(key: str) -> None:
    key = (key or "").strip()
    if not key:
        raise ValueError("API key is empty.")
    if _keyring_usable():
        keyring.set_password(SERVICE_NAME, ACCOUNT_NAME, key)
        return
    _config_file().write_text(json.dumps({"gemini_api_key": key}), encoding="utf-8")


def load_key() -> str | None:
    if _keyring_usable():
        try:
            return keyring.get_password(SERVICE_NAME, ACCOUNT_NAME)
        except KeyringError:
            return None
    f = _config_file()
    if f.exists():
        try:
            return json.loads(f.read_text(encoding="utf-8")).get("gemini_api_key")
        except (ValueError, OSError):
            return None
    return None


def has_key() -> bool:
    return bool(load_key())


def clear_key() -> None:
    if _keyring_usable():
        try:
            keyring.delete_password(SERVICE_NAME, ACCOUNT_NAME)
        except KeyringError:
            pass
        return
    f = _config_file()
    if f.exists():
        f.unlink()
