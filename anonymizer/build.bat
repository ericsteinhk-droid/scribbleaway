@echo off
setlocal enabledelayedexpansion
echo ============================================================
echo  Office File Anonymizer - Windows Build Script
echo ============================================================
echo.

REM ── 1. Install Python dependencies ──────────────────────────────────────────
echo [1/3] Installing Python packages...
pip install python-docx openpyxl "spacy>=3.7" pyinstaller
if errorlevel 1 (
    echo ERROR: pip install failed.
    goto :error
)

REM ── 2. Download the spaCy English model ─────────────────────────────────────
echo.
echo [2/3] Downloading spaCy English model (en_core_web_sm)...
python -m spacy download en_core_web_sm
if errorlevel 1 (
    echo ERROR: Could not download spaCy model.
    goto :error
)

REM ── 3. Build the EXE ────────────────────────────────────────────────────────
echo.
echo [3/3] Building EXE with PyInstaller...
echo       (This may take several minutes and produce a large file.)
echo.

pyinstaller ^
    --onefile ^
    --console ^
    --name "OfficeAnonymizer" ^
    --collect-all spacy ^
    --collect-all en_core_web_sm ^
    --collect-all thinc ^
    --collect-all blis ^
    --collect-all cymem ^
    --collect-all preshed ^
    --collect-all murmurhash ^
    --hidden-import en_core_web_sm ^
    --hidden-import spacy.lang.en ^
    main.py

if errorlevel 1 goto :error

echo.
echo ============================================================
echo  Build complete!
echo  Output: dist\OfficeAnonymizer.exe
echo.
echo  NOTE: First launch may take 15-30 seconds while the
echo  bundled model is extracted to a temporary directory.
echo ============================================================
goto :end

:error
echo.
echo BUILD FAILED. See error messages above.
echo.
echo Troubleshooting tips:
echo   - Make sure Python 3.9+ is installed and on PATH
echo   - Run this script from the directory containing main.py
echo   - Check your internet connection for the spaCy model download
exit /b 1

:end
endlocal
