# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for NMS/DDN Translator
# One-file Windows executable.  No LibreOffice dependency.
# Build: pyinstaller nms_translator.spec

block_cipher = None

a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=[('evoq_logo.png', '.')],
    hiddenimports=[
        # lxml C extensions
        'lxml.etree',
        'lxml._elementpath',
        'lxml.builder',
        # anthropic SDK and its dependencies
        'anthropic',
        'httpx',
        'httpcore',
        'anyio',
        'certifi',
        'charset_normalizer',
        'idna',
        'sniffio',
        'h11',
        'PIL', 'PIL.Image', 'PIL.ImageTk',
        # our modules
        'config',
        'api_client',
        'nms_preprocess',
        'nms_segment',
        'nms_translate',
        'nms_checks',
        'nms_tn',
        'nms_pipeline',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # keep the bundle small
        'matplotlib', 'numpy', 'pandas', 'scipy',
        'docx', 'openpyxl', 'xlrd',
        'tkinter.test',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zlib_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='NMSTranslator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,           # no console window for end users
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,               # add icon=r'icon.ico' if you have one
)
