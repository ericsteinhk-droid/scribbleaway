@echo off
REM Build the EVOQ Render Enhancer into a single Windows .exe (dist\RenderEnhancer.exe)
pyinstaller --onefile --windowed --add-data "evoq_logo.png;." --collect-all tkinterdnd2 --hidden-import requests --name RenderEnhancer render_enhancer.py
echo.
echo Build complete. Executable is in the dist\ folder.
pause
