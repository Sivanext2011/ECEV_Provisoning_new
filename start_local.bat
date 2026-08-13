@echo off
echo ========================================
echo   ECEV Provisioning Tool v2 - Local
echo ========================================
echo.

start "ECEV Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload"
timeout /t 3 /nobreak >nul
start "ECEV Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 5 /nobreak >nul
start http://localhost:5173

echo.
echo Backend running on http://localhost:8001
echo Frontend running on http://localhost:5173
echo.
echo Close the terminal windows to stop the servers.
pause
