@echo off
setlocal
echo ============================================================
echo  NMS/DDN Translator -- Windows build
echo ============================================================
echo.

:: Require Python 3.11+
python --version 2>nul || (
    echo ERROR: Python not found on PATH. Install Python 3.11+ and retry.
    exit /b 1
)

echo Installing/upgrading dependencies...
pip install --upgrade anthropic lxml pyinstaller
if errorlevel 1 (
    echo ERROR: pip install failed.
    exit /b 1
)

echo.
echo Building one-file executable...
pyinstaller nms_translator.spec --clean
if errorlevel 1 (
    echo ERROR: PyInstaller build failed.
    exit /b 1
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
endlocal
pause
