# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for NMS/DDN Translator
# One-file Windows executable.  No LibreOffice dependency.
# Build: python -m PyInstaller nms_translator.spec

a = Analysis(
    ['gui.py'],
    pathex=[],
    binaries=[],
    datas=[('evoq_logo.png', '.'), ('NMS-DDN_Bilingual_Lexicon.txt', '.')],
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
    a.binaries,
    a.datas,
    splash,
    splash.binaries,
    [],
    name='NMSTranslator',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,               # add icon=r'icon.ico' if you have one
)
