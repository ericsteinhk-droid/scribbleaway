# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — Analyseur de Rapports d'Heures
# --onedir : bundle stays extracted → no per-launch decompression → fast startup

a = Analysis(
    ['src/analyseur_heures1.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        # matplotlib TkAgg backend
        'matplotlib.backends.backend_tkagg',
        'matplotlib.backends._backend_tk',
        'matplotlib.figure',
        'matplotlib.pyplot',
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
        # stdlib pulled in transitively (pathlib -> urllib.parse at import time)
        # PyInstaller static analysis misses these; force-include to avoid
        # "No module named urllib" crash from pyi_rth_inspect at startup.
        'urllib',
        'urllib.parse',
        'urllib.request',
        'urllib.error',
        'urllib.response',
        'zipfile',
        'pathlib',
        'inspect',
    ],
    excludes=[
        # alternate GUI toolkits (definitely not installed)
        'PyQt5', 'PyQt6', 'wx', 'gi',
        # heavy scientific libs not used by this app
        'scipy', 'sklearn', 'cv2',
        # Jupyter / IPython
        'IPython', 'notebook', 'ipykernel',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],                     # binaries go into COLLECT, not here
    exclude_binaries=True,  # required for onedir
    name='AnalyseurHeures',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,              # skip UPX: decompression at launch adds latency
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name='AnalyseurHeures',
)
