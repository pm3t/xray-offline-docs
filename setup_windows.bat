@echo off
echo =======================================
echo Setting up X-Ray Offline System...
echo =======================================

echo 1. Installing dependencies...
call npm install

echo.
echo 2. Building frontend...
call npm run build

echo.
echo =======================================
echo Setup complete!
echo You can now run "start_app.bat" to start the server.
echo =======================================
pause
