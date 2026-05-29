@echo off
chcp 65001 >nul
title Figma to Code (Figma Mode)

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

:: Kill any existing process on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo ===================================================
echo   Figma to Code - Figma Mode Started
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

