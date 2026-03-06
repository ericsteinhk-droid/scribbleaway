@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::  organize_desktop.bat
::  Organizes files on your Desktop into categorized folders.
::  Run from anywhere — auto-detects Desktop (incl. OneDrive).
:: ============================================================

:: ------------------------------------------------------------------
:: Auto-detect the real Desktop path via registry (works with OneDrive
:: folder redirection, which moves Desktop to OneDrive\Desktop).
:: ------------------------------------------------------------------
set "DESKTOP="
for /f "tokens=3*" %%A in (
    'reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders" /v Desktop 2^>nul'
) do set "DESKTOP=%%A %%B"
:: Strip trailing space that the "tokens=3*" trick can leave
if defined DESKTOP set "DESKTOP=%DESKTOP: =%"
:: Fallback if registry query failed
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\Desktop"

set "MOVED=0"

echo.
echo  Desktop Organizer
echo  ==================
echo  Target: %DESKTOP%
echo.

:: Count files (not folders, not .lnk shortcuts) so the user knows what to expect
set "_total=0"
for %%f in ("%DESKTOP%\*") do (
    if not "%%~xf"==".lnk" set /a _total+=1
)
echo  Non-shortcut files found: %_total%
echo.

if %_total%==0 (
    echo  Nothing to organize. Your Desktop may only contain folders and shortcuts,
    echo  or the path above may be wrong.
    echo.
    goto :end
)

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
:: Note: .lnk shortcuts are never matched and are always left in place.
:: ------------------------------------------------------------

:: Images — older than 90 days go to "Old Photos", recent ones go to "Images"
::
:: Step 1: forfiles finds images older than 90 days; paths are written to a
::         temp file and then processed one-by-one through :MoveFile so that
::         conflict handling and the MOVED counter work correctly.
set "_tmp=%TEMP%\old_imgs_%RANDOM%.txt"
if exist "%_tmp%" del "%_tmp%"
for %%e in (jpg jpeg png gif bmp webp tiff tif svg ico heic raw) do (
    forfiles /p "%DESKTOP%" /m "*.%%e" /d -90 /c "cmd /c echo @path" 2>nul >> "%_tmp%"
)
if exist "%_tmp%" (
    for /f "usebackq delims=" %%f in ("%_tmp%") do (
        if exist %%f call :MoveFile %%f "%DESKTOP%\Old Photos"
    )
    del "%_tmp%"
)

:: Step 2: move any remaining (recent) images to "Images"
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
echo  Files found    : %_total%
echo  Files moved    : %MOVED%
set /a _skipped=%_total%-%MOVED%
echo  Left in place  : %_skipped% (unrecognized extensions or folders)
echo.

:end
endlocal
pause
