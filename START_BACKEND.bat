@echo off
echo Starting ESS Design Backend...
echo.

REM Get the directory where this batch file is located
set SCRIPT_DIR=%~dp0

REM Start backend
echo Starting Backend API on https://localhost:7001
echo.
cd /d "%SCRIPT_DIR%ESSDesign.Server"
dotnet run

pause
