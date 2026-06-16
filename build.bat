@echo off
pyinstaller --onefile --windowed contact_sheet_builder.py
echo.
echo Build complete. Executable is in the dist\ folder.
pause
