@echo off
setlocal
title VPN Pro+ — Virtual Network Driver Setup
echo ==========================================================
echo   VPN Pro+ — Virtual Network Driver ("WAN") Setup
echo ==========================================================
echo.
echo Requesting Administrator privileges to configure virtual adapter...
echo.

powershell.exe -NoProfile -Command "Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"\"%~dp0scripts\setup_virtual_driver.ps1\"\"' -Verb RunAs"

echo.
echo If a User Account Control (UAC) prompt appeared, click YES to allow changes.
echo Setup process launched.
echo.
pause
