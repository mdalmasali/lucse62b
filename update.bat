@echo off
title CSE 62B Website - Auto Update
color 0A

echo ================================================
echo   CSE 62B Website - Updating from GitHub...
echo ================================================
echo.

cd /d "%~dp0"

echo [1/3] Checking git status...
git status
echo.

echo [2/3] Pulling latest changes from main branch...
git pull origin main
echo.

if %ERRORLEVEL% == 0 (
    echo [3/3] Update successful!
    echo.
    echo ================================================
    echo   All changes downloaded successfully!
    echo ================================================
) else (
    echo [3/3] Something went wrong. See error above.
    echo.
    echo ================================================
    echo   Update FAILED. Check your internet or git.
    echo ================================================
)

echo.
pause
