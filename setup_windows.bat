@echo off
echo =======================================
echo Setting up X-Ray Offline System...
echo =======================================

echo.
echo 1. Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo [ERROR] npm install failed! Ensure Node.js is installed.
    pause
    exit /b 1
)

echo.
echo 2. Building frontend assets...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Check the error messages above.
    pause
    exit /b 1
)

echo.
echo =======================================
echo Setup COMPLETE!
echo Run "start_app.bat" to start the server.
echo =======================================
pause
