@echo off
setlocal
cd /d "%~dp0.."
set "PERSIST=%~dp0.data"

echo ==========================================================
echo   zelm (Vue3 + Hono + D1)  -  LOCAL TEST LAUNCHER
echo ----------------------------------------------------------
echo   app dir    : %CD%
echo   local data : %PERSIST%
echo ==========================================================
echo.

echo [1/3] Building frontend (vite build) ...
call npx --no-install vite build
if errorlevel 1 goto :fail

echo.
echo [2/3] Preparing LOCAL D1 database (schema) ...
call npx --no-install wrangler d1 execute auth-db --local --persist-to "%PERSIST%" --file=./migrations/schema.sql -y
if errorlevel 1 goto :fail

echo.
echo [3/3] Seeding accounts (owner + demo) ...
call npx --no-install wrangler d1 execute auth-db --local --persist-to "%PERSIST%" --file="%~dp0seed-owner.sql" -y
if errorlevel 1 goto :fail

echo.
echo ==========================================================
echo   URL     : http://127.0.0.1:8787
echo   OWNER   : zelm  (password: set in seed-owner.sql / .dev.vars)
echo   DEMO    : demo  (password: set in seed-owner.sql / .dev.vars)
echo   Admin   : http://127.0.0.1:8787/#/admin
echo   Stop    : Ctrl + C
echo ==========================================================
echo.
call npx --no-install wrangler dev --local --port 8787 --persist-to "%PERSIST%"
goto :eof

:fail
echo.
echo [ERROR] A step failed above. Aborting.
pause
exit /b 1
