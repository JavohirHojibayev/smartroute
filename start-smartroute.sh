#!/usr/bin/env bash
set -e

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting SmartRoute System [SQLite Mode]..."

if [ ! -f "$APP_ROOT/backend/.env" ]; then
    if [ -f "$APP_ROOT/backend/.env.example" ]; then
        echo "Creating backend/.env from backend/.env.example..."
        cp "$APP_ROOT/backend/.env.example" "$APP_ROOT/backend/.env"
    fi
fi

mkdir -p "$APP_ROOT/backend/db"

if [ ! -d "$APP_ROOT/backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    (cd "$APP_ROOT/backend" && npm install)
fi

if [ ! -d "$APP_ROOT/frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    (cd "$APP_ROOT/frontend" && npm install)
fi

echo "Starting Backend (NestJS)..."
(cd "$APP_ROOT/backend" && HOST=0.0.0.0 PORT=3000 npm run start:dev) &
BACKEND_PID=$!

echo "Starting Frontend (Vite)..."
(cd "$APP_ROOT/frontend" && npm run dev) &
FRONTEND_PID=$!

echo "Startup Complete!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:3000"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" EXIT INT TERM
wait
