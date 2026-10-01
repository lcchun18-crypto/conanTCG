@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ==========================================
echo   Conan TCG GitHub / Render 업데이트
echo ==========================================
echo.

for /f "delims=" %%i in ('git branch --show-current') do set BRANCH=%%i

if /I not "%BRANCH%"=="master" (
    echo [중단] 현재 브랜치가 master가 아닙니다.
    echo 현재 브랜치: %BRANCH%
    pause
    exit /b 1
)

echo 현재 변경된 파일:
echo ------------------------------------------
git status --short
echo ------------------------------------------
echo.

git diff --quiet && git diff --cached --quiet
if %errorlevel%==0 (
    git status --porcelain | findstr . >nul
    if errorlevel 1 (
        echo 변경된 파일이 없습니다.
        pause
        exit /b 0
    )
)

set /p CONFIRM=위 변경사항을 GitHub와 Render에 배포할까요? (Y/N): 
if /I not "%CONFIRM%"=="Y" (
    echo 취소했습니다.
    pause
    exit /b 0
)

echo.
set /p MSG=업데이트 내용을 짧게 입력하세요 (Enter = Update Conan TCG): 
if "%MSG%"=="" set "MSG=Update Conan TCG"

echo.
echo [1/3] 변경사항 등록 중...
git add -A
if errorlevel 1 goto ERROR

echo [2/3] 커밋 중...
git commit -m "%MSG%"
if errorlevel 1 goto ERROR

echo [3/3] GitHub에 업로드 중...
git push origin master
if errorlevel 1 goto ERROR

echo.
echo ==========================================
echo   완료!
echo   GitHub 업데이트 성공
echo   Render가 자동으로 새 버전을 배포합니다.
echo ==========================================
echo.
pause
exit /b 0

:ERROR
echo.
echo ==========================================
echo   오류가 발생했습니다.
echo   위 메시지를 확인해주세요.
echo ==========================================
pause
exit /b 1