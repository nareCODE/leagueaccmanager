@echo off
:: Check if npm is installed
call npm -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo npm is not installed. Installing Node.js now...
    winget install OpenJS.NodeJS -e --silent
    echo Installation finished. Please close this window, open a new one, and run this file again.
    pause
    exit /b
)

echo Installing dependencies...
call npm install

echo Starting app...
call npm start
pause