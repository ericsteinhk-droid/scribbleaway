@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  organize_desktop.bat
::  Organizes files on your Desktop into categorized folders.
::  Run from anywhere — it always targets %USERPROFILE%\Desktop
:: ============================================================

set "DESKTOP=%USERPROFILE%\Desktop"
set "MOVED=0"
set "SKIPPED=0"

echo.
echo  Desktop Organizer
echo  ==================
echo  Target: %DESKTOP%
echo.

:: Pause for confirmation
set /p "CONFIRM=Organize files on your Desktop? (Y/N): "
if /i not "%CONFIRM%"=="Y" (
    echo Cancelled.
    goto :end
)
echo.

:: ------------------------------------------------------------
:: Helper: move a file into a subfolder, handle name conflicts
:: ------------------------------------------------------------
:: Usage: call :MoveFile "<source>" "<destFolder>"
goto :skip_functions

:MoveFile
    set "_src=%~1"
    set "_dir=%~2"
    set "_name=%~nx1"

    :: Create destination folder if needed
    if not exist "%_dir%" mkdir "%_dir%"

    :: If a file with the same name exists, append a number
    set "_dest=%_dir%\%_name%"
    set "_count=1"
    :rename_loop
    if exist "%_dest%" (
        set "_base=%~n1"
        set "_ext=%~x1"
        set "_dest=%_dir%\!_base!_!_count!!_ext!"
        set /a "_count+=1"
        goto :rename_loop
    )

    move "%_src%" "%_dest%" >nul
    echo   [+] %_name%  ->  %_dir%
    set /a MOVED+=1
    goto :eof

:skip_functions

:: ------------------------------------------------------------
:: Category definitions  (add/remove extensions as you like)
:: ------------------------------------------------------------

:: Images
for %%f in (
    "%DESKTOP%\*.jpg"  "%DESKTOP%\*.jpeg" "%DESKTOP%\*.png"
    "%DESKTOP%\*.gif"  "%DESKTOP%\*.bmp"  "%DESKTOP%\*.webp"
    "%DESKTOP%\*.tiff" "%DESKTOP%\*.tif"  "%DESKTOP%\*.svg"
    "%DESKTOP%\*.ico"  "%DESKTOP%\*.heic" "%DESKTOP%\*.raw"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Images"
)

:: Documents
for %%f in (
    "%DESKTOP%\*.pdf"  "%DESKTOP%\*.doc"  "%DESKTOP%\*.docx"
    "%DESKTOP%\*.xls"  "%DESKTOP%\*.xlsx" "%DESKTOP%\*.ppt"
    "%DESKTOP%\*.pptx" "%DESKTOP%\*.odt"  "%DESKTOP%\*.ods"
    "%DESKTOP%\*.odp"  "%DESKTOP%\*.txt"  "%DESKTOP%\*.rtf"
    "%DESKTOP%\*.csv"  "%DESKTOP%\*.md"   "%DESKTOP%\*.epub"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Documents"
)

:: Videos
for %%f in (
    "%DESKTOP%\*.mp4"  "%DESKTOP%\*.mkv"  "%DESKTOP%\*.avi"
    "%DESKTOP%\*.mov"  "%DESKTOP%\*.wmv"  "%DESKTOP%\*.flv"
    "%DESKTOP%\*.webm" "%DESKTOP%\*.m4v"  "%DESKTOP%\*.mpg"
    "%DESKTOP%\*.mpeg"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Videos"
)

:: Music
for %%f in (
    "%DESKTOP%\*.mp3"  "%DESKTOP%\*.wav"  "%DESKTOP%\*.flac"
    "%DESKTOP%\*.aac"  "%DESKTOP%\*.ogg"  "%DESKTOP%\*.wma"
    "%DESKTOP%\*.m4a"  "%DESKTOP%\*.aiff"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Music"
)

:: Archives
for %%f in (
    "%DESKTOP%\*.zip"  "%DESKTOP%\*.rar"  "%DESKTOP%\*.7z"
    "%DESKTOP%\*.tar"  "%DESKTOP%\*.gz"   "%DESKTOP%\*.bz2"
    "%DESKTOP%\*.xz"   "%DESKTOP%\*.iso"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Archives"
)

:: Code & Scripts
for %%f in (
    "%DESKTOP%\*.py"   "%DESKTOP%\*.js"   "%DESKTOP%\*.ts"
    "%DESKTOP%\*.html" "%DESKTOP%\*.css"  "%DESKTOP%\*.json"
    "%DESKTOP%\*.xml"  "%DESKTOP%\*.sh"   "%DESKTOP%\*.bat"
    "%DESKTOP%\*.ps1"  "%DESKTOP%\*.c"    "%DESKTOP%\*.cpp"
    "%DESKTOP%\*.java" "%DESKTOP%\*.cs"   "%DESKTOP%\*.go"
    "%DESKTOP%\*.rs"   "%DESKTOP%\*.php"  "%DESKTOP%\*.rb"
    "%DESKTOP%\*.sql"  "%DESKTOP%\*.yaml" "%DESKTOP%\*.yml"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Code"
)

:: Executables & Installers
for %%f in (
    "%DESKTOP%\*.exe"  "%DESKTOP%\*.msi"  "%DESKTOP%\*.apk"
    "%DESKTOP%\*.dmg"  "%DESKTOP%\*.deb"  "%DESKTOP%\*.rpm"
) do (
    if exist "%%~f" call :MoveFile "%%~f" "%DESKTOP%\Programs"
)

:: ------------------------------------------------------------
:: Summary
:: ------------------------------------------------------------
echo.
echo  Done!
echo  ------
echo  Files moved  : %MOVED%
echo.

:end
endlocal
pause
