@echo off
title Orcamentos
echo.
echo   ============================================
echo    Orcamentos
echo   ============================================
echo.

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ERRO: Node.js nao encontrado.
    echo   Baixe em: https://nodejs.org ^(versao LTS^)
    echo.
    pause
    exit /b 1
)

for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| find ":3333 "') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo   Iniciando servidor em http://localhost:3333
echo   NAO feche esta janela enquanto estiver usando.
echo   Para parar pressione Ctrl+C
echo.

start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3333"
cd /d "%~dp0"
node server.js
pause
