@echo off
setlocal EnableExtensions
set "APP_ROOT=%~dp0"

echo Starting SmartRoute System [SQLite Mode]...
if "%HOST_IP%"=="" set "HOST_IP=localhost"

if not exist "%APP_ROOT%backend\.env" (
    if exist "%APP_ROOT%backend\.env.example" (
        echo Creating backend\.env from backend\.env.example...
        copy "%APP_ROOT%backend\.env.example" "%APP_ROOT%backend\.env" >nul
    )
)

if not exist "%APP_ROOT%backend\db" (
    mkdir "%APP_ROOT%backend\db"
)

if not exist "%APP_ROOT%backend\node_modules" (
    echo Installing backend dependencies...
    cmd /c "cd /d ""%APP_ROOT%backend"" && npm install"
)

if not exist "%APP_ROOT%frontend\node_modules" (
    echo Installing frontend dependencies...
    cmd /c "cd /d ""%APP_ROOT%frontend"" && npm install"
)

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
start "SmartRoute Frontend" cmd /k "cd /d ""%APP_ROOT%frontend"" && npm run dev"

echo Initializing Backend NestJS Server (SQLite)...
start "SmartRoute Backend" cmd /k "cd /d ""%APP_ROOT%backend"" && set ""HOST=0.0.0.0"" && set ""PORT=3000"" && npm run start:dev"

echo Startup Complete!
echo Frontend: http://localhost:5173
echo Frontend (LAN): http://%HOST_IP%:5173
echo Backend:  http://localhost:3000
echo Backend  (LAN): http://%HOST_IP%:3000
endlocal & exit /b 0
 
