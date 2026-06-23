@echo off
setlocal EnableExtensions
set "APP_ROOT=%~dp0"
set "NODE_ENV=production"

echo Starting SmartRoute System in PRODUCTION Mode...
if "%HOST_IP%"=="" set "HOST_IP=localhost"

echo Releasing occupied ports (3000, 5173) if needed...
for %%P in (3000 5173) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
        if not "%%A"=="0" (
            echo Freeing port %%P from PID %%A...
            taskkill /F /PID %%A >nul 2>&1
        )
    )
)

echo ===================================
echo 1. Building Frontend...
echo ===================================
cd /D "%APP_ROOT%frontend"
call npm run build

echo ===================================
echo 2. Building Backend...
echo ===================================
cd /D "%APP_ROOT%backend"
call npm run build

echo ===================================
echo 3. Starting Production Servers...
echo ===================================
echo Starting Frontend Server (Vite Preview)...
start "SmartRoute Frontend (PROD)" /D "%APP_ROOT%frontend" cmd /k "npm run preview -- --host 0.0.0.0 --port 5173"

echo Starting Backend Server (NestJS)...
start "SmartRoute Backend (PROD)" /D "%APP_ROOT%backend" cmd /k "set "HOST=0.0.0.0" && set "PORT=3000" && npm run start:prod"

echo Production Startup Complete!
echo ===================================
echo Frontend: http://localhost:5173
echo Frontend (LAN): http://%HOST_IP%:5173
echo Backend:  http://localhost:3000
echo Backend  (LAN): http://%HOST_IP%:3000
echo ===================================

endlocal & exit /b 0
