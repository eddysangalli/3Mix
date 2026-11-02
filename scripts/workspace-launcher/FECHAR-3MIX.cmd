@echo off
setlocal
chcp 65001 >nul
title 3Mix Pro - Encerrar Suíte Broadcast
echo [3Mix Pro] Encerrando processos e liberando portas do sistema...
set "FM_NODE=%~dp0..\..\obs-vmix\runtime\node.exe"
if exist "%~dp0..\..\node24\node.exe" set "FM_NODE=%~dp0..\..\node24\node.exe"
"%FM_NODE%" "%~dp0..\..\scripts\inicializacao\fechar-3mix.mjs" %*
if errorlevel 1 (
  echo.
  echo O encerramento apresentou avisos. Verifique as mensagens acima.
  pause
  exit /b 1
)
timeout /t 2 >nul
exit /b 0
