@echo off
pyinstaller --onefile --windowed --add-data "evoq_logo.png;." --collect-all tkinterdnd2 contact_sheet_builder.py
echo.
echo Build complete. Executable is in the dist\ folder.
pause
