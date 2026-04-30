# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec — Analyseur de Rapports d'Heures
# --onedir : bundle stays extracted → no per-launch decompression → fast startup

a = Analysis(
    ['src/analyseur_heures1.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[
        'matplotlib.backends.backend_tkagg',
        'matplotlib.backends._backend_tk',
        'matplotlib.figure',
        'matplotlib.pyplot',
        'openpyxl',
        'openpyxl.styles',
        'openpyxl.utils',
        'openpyxl.reader.excel',
        'pandas',
        'pandas._libs.tslibs.base',
        'tkinter',
        'tkinter.ttk',
        'tkinter.filedialog',
        'tkinter.messagebox',
    ],
    excludes=[
        # testing / docs
        'unittest', 'doctest', 'pydoc',
        # network / crypto (unused)
        'http', 'urllib', 'email', 'ssl', '_ssl', 'socket',
        'ftplib', 'smtplib', 'imaplib', 'poplib',
        # DB / serialisation (unused)
        'sqlite3', '_sqlite3', 'dbm',
        # GUI toolkits other than Tk
        'PyQt5', 'PyQt6', 'wx', 'gi',
        # heavy scientific unused
        'scipy', 'sklearn', 'cv2', 'PIL.ImageQt',
        # IPython / notebook
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
