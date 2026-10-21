@echo off
rem Abre o jogo Magic Forest no navegador. Feche esta janela para parar o jogo.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias, so na primeira vez...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Abrindo Magic Forest no navegador. Feche esta janela para parar o jogo.
call npx vite --open
pause
