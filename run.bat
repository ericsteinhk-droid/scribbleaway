@echo off
setlocal
cd /d "%~dp0"

echo ============================================================
echo  NMS/DDN Translator
echo ============================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found on PATH.
    echo.
    echo Install Python 3.11+ from https://python.org
    echo During installation, tick "Add Python to PATH".
    goto :done
)

:: Install dependencies only if missing
python -c "import anthropic, lxml, PIL" >nul 2>&1
if errorlevel 1 (
    echo Installing dependencies ^(first run only^)...
    pip install anthropic lxml Pillow --quiet --disable-pip-version-check
    if errorlevel 1 (
        echo.
        echo pip install failed. Trying with --user flag...
        pip install anthropic lxml Pillow --user --quiet --disable-pip-version-check
        if errorlevel 1 (
            echo.
            echo ERROR: Could not install dependencies.
            echo Try running this file as Administrator, or open a command
            echo prompt and run:  pip install anthropic lxml Pillow
            goto :done
        )
    )
    echo Dependencies installed.
    echo.
)

:: Launch
python gui.py
if errorlevel 1 (
    echo.
    echo The application closed with an error. See above for details.
    goto :done
)

:done
endlocal
pause
