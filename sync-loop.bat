@echo off
cd /d D:\New folder\niche-trust-platform
:loop
node sync-daemon.js
timeout /t 5 /nobreak >nul
goto loop
