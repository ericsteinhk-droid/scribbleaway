@echo off
pyinstaller --onefile --windowed --add-data "evoq_logo.png;." contact_sheet_builder.py
echo.
echo Build complete. Executable is in the dist\ folder.
pause
