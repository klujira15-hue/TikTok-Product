@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 LTS from https://nodejs.org/
  pause
  exit /b 1
)
pushd "%~dp0"
start "" http://127.0.0.1:4317
node server.mjs
popd
pause
