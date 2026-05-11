@echo off
echo =======================================
echo  X-Ray Offline System - Starting...
echo =======================================
echo.

rem Kill any leftover node processes on critical ports before starting
echo Checking for old processes on ports 3000, 1337, 2121...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    echo Killing old process on port 3000 (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":1337 " ^| findstr "LISTENING"') do (
    echo Killing old process on port 1337 (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":2121 " ^| findstr "LISTENING"') do (
    echo Killing old process on port 2121 (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo Server running at http://localhost:3000
echo.
echo NOTE: Do NOT close this window while the app is in use.
echo Press Ctrl+C to stop the server.
echo.

node server.mjs

pause
