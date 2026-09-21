@echo off
chcp 65001 >nul
title خادم إدارة الديون
echo.
echo ========================================
echo   خادم تطبيق إدارة الديون
echo ========================================
echo.
echo جاري تشغيل الخادم المحلي...
echo.

cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [خطأ] Node.js غير مثبت. يرجى تثبيته من https://nodejs.org
    pause
    exit /b 1
)

start "" http://127.0.0.1:8080/index.html
npx --yes http-server -p 8080 -a 127.0.0.1 -c-1 -o /index.html