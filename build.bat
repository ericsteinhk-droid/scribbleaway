@echo off
setlocal
echo ============================================================
echo  NMS/DDN Translator -- Windows build
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
echo Building one-file executable...
python -m PyInstaller nms_translator.spec --clean
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    goto :done
)

echo.
echo ============================================================
echo  BUILD COMPLETE
echo  Executable: dist\NMSTranslator.exe
echo.
echo  Distribute to workstations:
echo    1. Copy dist\NMSTranslator.exe
echo    2. Copy NMS-DDN_Bilingual_Lexicon.txt to each workstation
echo    3. First run will prompt for API key + lexicon path
echo ============================================================

:done
endlocal
pause
