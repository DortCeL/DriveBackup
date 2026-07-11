@echo off
echo.
echo  ====================================
echo   DriveBackup - Installing...
echo  ====================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: Node.js is not installed.
    echo  Please download it from https://nodejs.org and re-run this script.
    pause
    exit /b 1
)

echo  Node.js found. Installing dependencies...
echo.
npm install

if %errorlevel% neq 0 (
    echo.
    echo  ERROR: npm install failed. Check the output above.
    pause
    exit /b 1
)

echo.
echo  ====================================
echo   Done! Starting DriveBackup...
echo  ====================================
echo.
npm start
