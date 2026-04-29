# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — Analyseur d'Heures par Phase

a = Analysis(
    ['src/analyseur_phases.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # matplotlib TkAgg backend + patches/lines
        'matplotlib.backends.backend_tkagg',
        'matplotlib.backends._backend_tk',
        'matplotlib.figure',
        'matplotlib.pyplot',
        'matplotlib.patches',
        'matplotlib.lines',
        # pandas / openpyxl
        'openpyxl',
        'openpyxl.styles',
        'openpyxl.utils',
        'openpyxl.reader.excel',
        'pandas',
        'pandas._libs.tslibs.base',
        # tkinter
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
    ],
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
    name='AnalyseurPhases',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,          # GUI app — no console window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
