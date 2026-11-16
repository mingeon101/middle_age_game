@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js on the host PC first: https://nodejs.org/
  pause
  exit /b 1
)
node server.cjs
pause
