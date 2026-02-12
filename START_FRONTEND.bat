@echo off
echo Starting ESS Design Frontend...
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Start frontend
echo Starting Frontend on https://localhost:5173
echo.
cd /d "%SCRIPT_DIR%essdesign.client"
npm run dev

pause
