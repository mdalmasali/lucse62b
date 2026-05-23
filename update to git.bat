@echo off
title CSE 62B Website - Push Update to GitHub
color 0B

echo ================================================
echo   CSE 62B Website - Pushing Changes to GitHub
echo ================================================
echo.

cd /d "%~dp0"

echo [1/4] Checking for changes...
git status
echo.

git diff --quiet && git diff --staged --quiet
if %ERRORLEVEL% == 0 (
    echo No changes to commit. Everything is up to date.
    echo.
    pause
    exit /b 0
)

echo [2/4] Enter commit message:
set /p MSG="  > "
echo.

echo [3/4] Staging all changes...
git add -A
echo.

echo [4/4] Committing and pushing to GitHub...
git commit -m "%MSG%"
git push origin main
echo.

if %ERRORLEVEL% == 0 (
    echo ================================================
    echo   Changes pushed to GitHub successfully!
    echo ================================================
) else (
    echo ================================================
    echo   Push FAILED. Check your internet or git.
    echo ================================================
)

echo.
pause
