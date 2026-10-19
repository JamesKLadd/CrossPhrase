@echo off
rem Starts the free PC judge. Keep this window open while you play; Ctrl+C stops it.
cd /d "%~dp0.."
call npm run pc-judge
pause
