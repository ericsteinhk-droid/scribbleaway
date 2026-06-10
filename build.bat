@echo off
setlocal
echo ============================================================
echo  EVOQ Spec Translator -- Windows build
echo ============================================================
echo.

:: Require Python 3.11+
python --version 2>nul || (
    echo ERROR: Python not found on PATH. Install Python 3.11+ and retry.
    goto :done
)

echo Installing/upgrading dependencies...
pip install --upgrade anthropic lxml Pillow pyinstaller
if errorlevel 1 (
    echo ERROR: pip install failed.
    goto :done
)

echo.
echo Generating application icon...
python -c "
from PIL import Image
img = Image.open('evoq_logo.png').convert('RGBA')
w, h = img.size
size = max(w, h)
sq = Image.new('RGBA', (size, size), (255, 255, 255, 255))
sq.paste(img, ((size - w) // 2, (size - h) // 2), img)
sizes = [256, 128, 64, 48, 32, 16]
imgs = [sq.resize((s, s), Image.LANCZOS).convert('RGBA') for s in sizes]
imgs[0].save('evoq_icon.ico', format='ICO', sizes=[(s,s) for s in sizes], append_images=imgs[1:])
print('  evoq_icon.ico generated.')
"
if errorlevel 1 (
    echo WARNING: Icon generation failed. Build will continue without it.
)

echo.
echo Building one-folder executable...
python -m PyInstaller nms_translator.spec --clean
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    goto :done
)

echo.
echo ============================================================
echo  BUILD COMPLETE
echo  Application folder: dist\NMSTranslator\
echo ============================================================
echo.

:: Try to build the installer if Inno Setup is present
set ISCC=
if exist "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" (
    set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
) else if exist "%ProgramFiles%\Inno Setup 6\ISCC.exe" (
    set "ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe"
)

if defined ISCC (
    echo Building installer with Inno Setup...
    if not exist installer_output mkdir installer_output
    "%ISCC%" installer.iss
    if errorlevel 1 (
        echo WARNING: Installer build failed. Distribute dist\NMSTranslator\ manually.
    ) else (
        echo.
        echo ============================================================
        echo  INSTALLER READY: installer_output\EvoqSpecTranslator_Setup_v4.0.exe
        echo ============================================================
    )
) else (
    echo NOTE: Inno Setup 6 not found -- skipping installer build.
    echo       Download from https://jrsoftware.org/isinfo.php and re-run
    echo       this script, or compile installer.iss manually.
    echo.
    echo       To distribute without an installer, copy the entire folder:
    echo         dist\NMSTranslator\
    echo       to each workstation and run NMSTranslator.exe from there.
)

:done
endlocal
pause
