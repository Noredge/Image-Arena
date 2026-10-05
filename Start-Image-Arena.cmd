@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. See README.md for setup instructions.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing locked project dependencies...
  call npm ci --no-fund --no-audit
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
if not exist "dist\index.html" (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Image Arena: http://127.0.0.1:4173/
echo Keep this window open while using the app. Ctrl+C stops the server.
call npm run preview -- --open
if errorlevel 1 (
  echo Could not start. Port 4173 may already be in use.
  echo If Image Arena is already running, open http://127.0.0.1:4173/
  pause
)
