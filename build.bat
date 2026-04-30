@echo off
:: ============================================================
:: Build script — Analyseurs EVOQ (Windows)
:: Requires Python 3.9+ and pip to be in PATH.
:: Run from the root of the repository.
::
:: Output : dist\AnalyseurHeures\  and  dist\AnalyseurPhases\
:: Double-cliquez sur le .exe dans chaque dossier pour lancer.
:: ============================================================

echo.
echo ============================================================
echo  Analyseurs EVOQ — Build des executables Windows (onedir)
echo ============================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Python introuvable. Installez Python 3.9+ et ajoutez-le au PATH.
    pause
    exit /b 1
)

:: Install / upgrade dependencies
echo [1/4] Installation des dependances...
python -m pip install --upgrade pip
pip install pandas openpyxl matplotlib pyinstaller
if errorlevel 1 (
    echo [ERREUR] Echec de l'installation des dependances.
    pause
    exit /b 1
)

:: Build AnalyseurHeures
echo.
echo [2/4] Build de AnalyseurHeures...
pyinstaller analyseur_heures1.spec --distpath dist --workpath build_tmp\heures --clean
if errorlevel 1 (
    echo [ERREUR] Echec du build AnalyseurHeures.
    pause
    exit /b 1
)

:: Build AnalyseurPhases
echo.
echo [3/4] Build de AnalyseurPhases...
pyinstaller analyseur_phases.spec --distpath dist --workpath build_tmp\phases --clean
if errorlevel 1 (
    echo [ERREUR] Echec du build AnalyseurPhases.
    pause
    exit /b 1
)

:: Done
echo.
echo [4/4] Termine !
echo.
echo  Applications generees dans le dossier dist\ :
echo    dist\AnalyseurHeures\AnalyseurHeures.exe
echo    dist\AnalyseurPhases\AnalyseurPhases.exe
echo.
echo  NOTE : Le dossier entier est necessaire (ne pas deplacer le .exe seul).
echo         Creez un raccourci vers le .exe pour un acces rapide.
echo         Demarrage rapide : aucune extraction au lancement (mode onedir).
echo ============================================================
pause
