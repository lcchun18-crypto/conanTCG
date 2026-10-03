@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ==========================================
echo   Conan TCG Update / Deploy
echo ==========================================
echo.

for /f "delims=" %%i in ('git branch --show-current') do set "BRANCH=%%i"

if /I not "%BRANCH%"=="master" (
    echo [STOP] Current branch is not master.
    echo Current branch: %BRANCH%
    pause
    exit /b 1
)

echo [0/5] Syncing with GitHub...
git pull --rebase --autostash origin master
if errorlevel 1 goto SYNC_ERROR

echo.
echo Changed files:
echo ------------------------------------------
git status --short
echo ------------------------------------------
echo.

git status --porcelain | findstr /r "." >nul
if errorlevel 1 (
    echo No changes found.
    pause
    exit /b 0
)

set "EXCEL_CHANGED=0"
git status --porcelain -- "data/cards.xlsx" | findstr /r "." >nul
if not errorlevel 1 set "EXCEL_CHANGED=1"

set /p "CONFIRM=Deploy these changes? (Y/N): "
if /I not "%CONFIRM%"=="Y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.

if "%EXCEL_CHANGED%"=="1" (
    echo [1/5] Checking Python requirements...
    python -c "import openpyxl" >nul 2>&1
    if errorlevel 1 (
        echo openpyxl is missing. Installing required Python packages...
        if exist "tools\requirements.txt" (
            python -m pip install -r "tools\requirements.txt"
        ) else (
            python -m pip install openpyxl
        )
        if errorlevel 1 goto PIP_ERROR
    ) else (
        echo Python requirements are ready.
    )

    echo [2/5] Validating cards.xlsx and building cards.json...
    python tools\build_cards_from_excel.py
    if errorlevel 1 goto EXCEL_ERROR
) else (
    echo [1/5] cards.xlsx unchanged - skipping Python requirement check.
    echo [2/5] cards.xlsx unchanged - skipping card DB build.
)

echo [3/5] Staging files...
git add -A
if errorlevel 1 goto ERROR

git diff --cached --quiet
if not errorlevel 1 (
    echo No staged changes found.
    pause
    exit /b 0
)

echo [4/5] Creating commit...
git commit -m "Update Conan TCG"
if errorlevel 1 goto ERROR

echo [5/5] Pushing to GitHub...
git push origin master
if errorlevel 1 goto ERROR

echo.
echo ==========================================
echo   SUCCESS
echo   GitHub push completed.
echo   Render will deploy automatically.
echo ==========================================
echo.
pause
exit /b 0

:PIP_ERROR
echo.
echo ==========================================
echo   PYTHON PACKAGE INSTALL FAILED
echo   Nothing was pushed to GitHub.
echo   Check the message above.
echo ==========================================
pause
exit /b 1

:EXCEL_ERROR
echo.
echo ==========================================
echo   CARD DATA BUILD FAILED
echo   Nothing was pushed to GitHub.
echo   Check the ERROR message above.
echo ==========================================
pause
exit /b 1

:SYNC_ERROR
echo.
echo ==========================================
echo   GIT SYNC FAILED
echo   Your local changes were not deleted.
echo   Check the message above.
echo ==========================================
pause
exit /b 1

:ERROR
echo.
echo ==========================================
echo   UPDATE FAILED
echo   Check the message above.
echo ==========================================
pause
exit /b 1
