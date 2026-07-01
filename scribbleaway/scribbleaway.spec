# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec: build ScribbleAway as a single windowed Windows .exe.

Build with:  pyinstaller --clean --noconfirm scribbleaway.spec
Output:      dist/ScribbleAway.exe
"""

from PyInstaller.utils.hooks import collect_all

datas, binaries, hiddenimports = [], [], []

# Bundle the EVOQ logo (used as the header image and window icon).
datas += [("app/assets/evoq_logo.png", "app/assets")]

# keyring and google-genai load parts of themselves lazily (backends / entry
# points), which PyInstaller's static analysis misses. Pull them in wholesale.
for pkg in ("keyring", "google.genai"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# The Windows credential-store backend and its native helper.
hiddenimports += [
    "keyring.backends.Windows",
    "win32ctypes.core",
    "win32ctypes.core.cffi",
    "win32ctypes.core.ctypes",
]

# PySide6 is handled by PyInstaller's bundled hooks automatically.

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="photoclean",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # windowed app, no console popup
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon="app/assets/evoq_logo.ico",
)
