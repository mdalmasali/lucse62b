@echo off
REM ════════════════════════════════════════════════════════════════
REM  FIFA WORLD CUP 2026 THEME — ONE-CLICK REMOVAL
REM  Double-click this file after the tournament to remove everything.
REM  It deletes the theme files, cleans theme.js + worker.js,
REM  re-deploys the worker, commits and pushes.
REM ════════════════════════════════════════════════════════════════
cd /d "%~dp0"
echo.
echo  ⚽ Removing FIFA World Cup 2026 theme...
echo.

REM 1. Delete theme asset files
if exist "assets\js\fifa26.js"   del /q "assets\js\fifa26.js"
if exist "assets\css\fifa26.css" del /q "assets\css\fifa26.css"
echo  [1/6] Theme files deleted

REM 2. Remove the loader lines from theme.js (any line mentioning fifa26)
powershell -NoProfile -Command "$f='assets/js/theme.js'; $c=Get-Content $f | Where-Object { $_ -notmatch 'fifa26|FIFA26' }; [IO.File]::WriteAllLines((Resolve-Path $f), $c)"
echo  [2/6] theme.js loader removed

REM 3. Remove the /fifa block from worker.js (between FIFA26-START and FIFA26-END)
powershell -NoProfile -Command "$f='worker/worker.js'; $l=Get-Content $f; $s=($l | Select-String -SimpleMatch 'FIFA26-START' | Select-Object -First 1).LineNumber; $e=($l | Select-String -SimpleMatch 'FIFA26-END' | Select-Object -First 1).LineNumber; if($s -and $e -and $e -gt $s){ $keep=@(); if($s -gt 1){$keep+=$l[0..($s-2)]}; if($e -lt $l.Count){$keep+=$l[$e..($l.Count-1)]}; [IO.File]::WriteAllLines((Resolve-Path $f), $keep); Write-Host '       /fifa route removed from worker.js' } else { Write-Host '       WARNING: FIFA26 markers not found in worker.js - remove manually' }"
echo  [3/6] worker.js cleaned

REM 4. Re-deploy the worker
echo  [4/6] Deploying worker (this may take a minute)...
cd worker
call npx wrangler deploy
cd ..

REM 5. Delete docs + this script from the repo
if exist "FIFA26-REMOVAL.md" del /q "FIFA26-REMOVAL.md"
echo  [5/6] Removal guide deleted

REM 6. Commit and push (also remove this script from the repo;
REM    the local copy keeps running and deletes itself at the end)
git add -A
git rm --cached -f remove-fifa26.bat >nul 2>&1
git commit -m "chore: remove FIFA World Cup 2026 theme (tournament over)"
git push
echo  [6/6] Committed and pushed
echo.
echo  ✅ FIFA 2026 theme fully removed! Site is back to normal.
echo     (Hard-refresh the site with Ctrl+Shift+R to verify)
echo.
pause

REM Delete this script itself (last step, after pause)
(goto) 2>nul & del "%~f0"
