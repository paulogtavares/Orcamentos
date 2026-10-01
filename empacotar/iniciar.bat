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
    echo   Instale o Node.js 24 ^(LTS^) em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "usebackq" %%v in (`node -p "process.versions.node.split('.')[0]"`) do set NODE_MAIOR=%%v
if %NODE_MAIOR% LSS 24 (
    echo   ERRO: esta versao precisa do Node.js 24 ou mais novo.
    node --version
    echo   Instale o Node.js 24 ^(LTS^) em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
set PORTA=3333
for /f "tokens=2 delims==" %%p in ('findstr /b "PORT=" .env 2^>nul') do set PORTA=%%p

echo   Iniciando servidor em http://localhost:%PORTA%
echo   NAO feche esta janela enquanto estiver usando.
echo   Para parar pressione Ctrl+C
echo.

start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:%PORTA%"
node --env-file-if-exists=.env server.js
pause
