@echo off
echo Starting ESS Design Application...
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Start backend in new window
echo [1/2] Starting Backend Server...
start "ESS Design - Backend" cmd /k "cd /d "%SCRIPT_DIR%ESSDesign.Server" && dotnet run"

REM Wait a few seconds for backend to start
timeout /t 5 /nobreak > nul

REM Start frontend in new window
echo [2/2] Starting Frontend...
start "ESS Design - Frontend" cmd /k "cd /d "%SCRIPT_DIR%essdesign.client" && npm run dev"

echo.
echo ========================================
echo ESS Design is starting!
echo.
echo Backend:  https://localhost:7001
echo Frontend: https://localhost:5173
echo.
echo Two windows will open - keep them running!
echo Press any key to close this window.
echo ========================================
pause
