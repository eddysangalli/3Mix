@echo off
setlocal
chcp 65001 >nul
title 3Mix Pro Broadcast Studio
echo [3Mix Pro] Iniciando suite de producao broadcast modular...
set "FM_NODE=%~dp0..\..\obs-vmix\runtime\node.exe"
if exist "%~dp0..\..\node24\node.exe" set "FM_NODE=%~dp0..\..\node24\node.exe"
"%FM_NODE%" "%~dp0..\..\scripts\inicializacao\abrir-freemix-atualizado.mjs" %*
if errorlevel 1 (
  echo.
  echo A abertura foi interrompida para preservar a instalacao. Leia a mensagem acima.
  pause
  exit /b 1
)
exit /b 0
