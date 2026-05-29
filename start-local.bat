@echo off
chcp 65001 >nul
title Figma to Code (Local Mode)

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Check node_modules
if not exist "node_modules" (
    echo [INFO] First time setup. Installing dependencies...
    call npm install
    echo.
)

:: Folder Selection Dialog using Node.js script
echo [INFO] Opening folder selection dialog...
node select-folder.js > temp_dir.txt

set /p SELECTED_DIR=<temp_dir.txt
del temp_dir.txt

if "%SELECTED_DIR%"=="CANCELLED" (
    echo [INFO] User cancelled folder selection.
    pause
    exit /b 0
)

if "%SELECTED_DIR%"=="" (
    echo [ERROR] No folder selected.
    pause
    exit /b 1
)

:: Kill any existing process on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Set LOCAL_DIR environment variable
set LOCAL_DIR=%SELECTED_DIR%

echo.
echo ===================================================
echo   Figma to Code - Local Mode Started
echo   Folder: %LOCAL_DIR%
echo ===================================================
echo.
echo   Please open your browser manually and visit:
echo   http://localhost:3000
echo.
echo   Press Ctrl+C to stop the server
echo ===================================================
echo.

:: Start server
node server.js

