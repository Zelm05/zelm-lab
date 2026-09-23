@echo off
setlocal
cd /d "%~dp0"

echo ==========================================================
echo   RESET local test data
echo   target: %CD%\.data
echo ==========================================================
echo.
echo This deletes the LOCAL test database only (safe: it is not
echo the online D1 database, and it lives inside this folder).
echo.
set /p ANS=Type YES to confirm: 
if /i not "%ANS%"=="YES" (
  echo Cancelled. Nothing was deleted.
  pause
  exit /b 0
)

if exist ".data" rmdir /s /q ".data"
echo.
echo Local data cleared. Run start.cmd to rebuild from scratch.
pause
