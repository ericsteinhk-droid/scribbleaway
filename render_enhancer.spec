# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for EVOQ Render Enhancer (Gemini Nano Banana)
# Run: pyinstaller render_enhancer.spec

block_cipher = None

a = Analysis(
    ['render_enhancer.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('evoq_logo.png', '.'),
        ('assets/render_enhancer_icon.png', 'assets'),
        ('assets/render_enhancer.ico', 'assets'),
    ],
    hiddenimports=[
        'PIL',
        'PIL.Image',
        'PIL.ImageTk',
        'PIL.ImageOps',
        'requests',
        'certifi',
        'tkinterdnd2',
    ],
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
    name='RenderEnhancer',
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
    icon='assets/render_enhancer.ico',
)
