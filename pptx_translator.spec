# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the EVOQ PowerPoint Translator (French -> English)
# Run: pyinstaller pptx_translator.spec

from PyInstaller.utils.hooks import collect_all

block_cipher = None

datas = [('evoq_logo.png', '.')]
binaries = []
hiddenimports = [
    'pptx',
    'lxml',
    'lxml.etree',
    'lxml._elementpath',
    'PIL',
    'PIL.Image',
    'PIL.ImageTk',
]

# The anthropic SDK pulls in httpx/pydantic/certifi at runtime; collect them
# fully so the onefile build works without missing-module surprises.
for pkg in ('anthropic', 'httpx', 'httpcore', 'anyio', 'certifi',
            'pydantic', 'pydantic_core', 'jiter', 'h11', 'sniffio', 'distro'):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

a = Analysis(
    ['pptx_translator.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='PPTXTranslator',
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
    icon=None,
)
