@echo off
echo Запуск CaféBook...
cd /d "%~dp0"
echo.
echo Открой браузер: http://localhost:3000
echo Логин: admin / Пароль: admin123
echo.
node server.js
pause
