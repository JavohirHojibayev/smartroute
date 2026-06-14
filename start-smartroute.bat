@echo off
setlocal EnableExtensions

set "APP_ROOT=%~dp0"

echo Starting SmartRoute System [SQLite Mode]...

if not defined HOST_IP call :DetectHostIp
if not defined HOST_IP set "HOST_IP=localhost"

echo Releasing occupied ports (3000, 5173) if needed...
for %%P in (3000 5173) do (
    for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
        if not "%%A"=="0" (
            echo Freeing port %%P from PID %%A...
            taskkill /F /PID %%A >nul 2>&1
        )
    )
)

echo Initializing Frontend Server (Vite)...
start "SmartRoute Frontend" /D "%APP_ROOT%frontend" cmd /k "npm run dev"

echo Initializing Backend NestJS Server (SQLite)...
start "SmartRoute Backend" /D "%APP_ROOT%backend" cmd /k "set HOST=0.0.0.0&& set PORT=3000&& npm run start:dev"

echo Startup Complete!
echo Frontend: http://localhost:5173
echo Frontend (LAN): http://%HOST_IP%:5173
echo Backend:  http://localhost:3000
echo Backend  (LAN): http://%HOST_IP%:3000

exit /b 0

:DetectHostIp
for /f "tokens=2 delims=:" %%I in ('ipconfig ^| findstr /I "IPv4"') do (
    for /f "tokens=* delims= " %%J in ("%%I") do (
        set "HOST_IP=%%J"
        exit /b 0
    )
)
exit /b 0
