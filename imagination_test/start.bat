@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PHP=D:\XAMPP\php\php.exe"
if not exist "%PHP%" set "PHP=php"

echo Тест воображения: сервер на http://localhost:8000
echo Журнал пишется в data\journal.json. Не закрывайте это окно во время работы.
echo.
start "" http://localhost:8000/index.html
"%PHP%" -S localhost:8000
