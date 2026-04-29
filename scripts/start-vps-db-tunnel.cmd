@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-vps-db-tunnel.ps1" %*

