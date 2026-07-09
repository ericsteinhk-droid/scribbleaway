@echo off
REM Build the EVOQ Render Enhancer into a single Windows .exe (dist\RenderEnhancer.exe)
pyinstaller --onefile --windowed --icon "assets\render_enhancer.ico" --add-data "evoq_logo.png;." --add-data "assets\render_enhancer_icon.png;assets" --add-data "assets\render_enhancer.ico;assets" --collect-all tkinterdnd2 --hidden-import requests --hidden-import certifi --name RenderEnhancer render_enhancer.py
echo.
echo Build complete. Executable is in the dist\ folder.
pause
