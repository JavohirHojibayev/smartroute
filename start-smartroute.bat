@echo off
echo Starting SmartRoute System [SQLite Mode]...
set HOST_IP=192.168.0.3

echo Initializing Frontend Server (Vite)...
start cmd /k "cd frontend && npm run dev"

echo Initializing Backend NestJS Server (SQLite)...
start cmd /k "cd backend && npm run start:dev"

echo Startup Complete!
echo Frontend: http://localhost:5173
echo Frontend (LAN): http://%HOST_IP%:5173
echo Backend:  http://localhost:3000
echo Backend  (LAN): http://%HOST_IP%:3000
