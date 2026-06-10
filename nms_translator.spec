# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for NMS/DDN Translator
# One-FOLDER Windows build (faster startup, friendlier to AV than one-file).
# Pair with installer.iss to produce a proper Windows installer.
# Build: python -m PyInstaller nms_translator.spec --clean

a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('evoq_logo.png', '.'),
        ('evoq_icon.ico', '.'),
        ('NMS-DDN_Bilingual_Lexicon.txt', '.'),
    ],
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
        'ui_strings',
        'nms_cache',
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
        'matplotlib', 'numpy', 'pandas', 'scipy',
        'docx', 'openpyxl', 'xlrd',
        'tkinter.test',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

splash = Splash(
    'evoq_logo.png',
    binaries=a.binaries,
    datas=a.datas,
    text_pos=(10, 50),
    text_size=10,
    text_color='#0055a5',
    minify_script=True,
    always_on_top=True,
)

exe = EXE(
    pyz,
    a.scripts,
    splash,
    splash.binaries,
    [],
    name='NMSTranslator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,          # UPX disabled — avoids AV false positives
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='evoq_icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    splash.binaries,
    strip=False,
    upx=False,
    name='NMSTranslator',
)
