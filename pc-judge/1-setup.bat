@echo off
rem Gets llama.cpp and the Gemma 4 E2B model for the free PC judge (about 3 GB, once).
rem If the Study App is installed, its copies are reused and nothing is downloaded.
cd /d "%~dp0.."
call npm run pc-judge:setup
pause
