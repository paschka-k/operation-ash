@echo off
rem Operation Ash launcher: double click. Needs Node.js (https://nodejs.org) and, once, "npm install" in this folder.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js not found. Install it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\three" (
  echo The game's packages are missing. Run "npm install" in this folder once, then run this file again.
  pause
  exit /b 1
)
node tools\play.mjs
if errorlevel 1 pause
