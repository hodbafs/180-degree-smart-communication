@echo off
title 180-Degree Smart Communication Assessment App
echo Starting Web Server...
echo Opening browser at http://localhost:8080...
start "" http://localhost:8080
powershell -ExecutionPolicy Bypass -File server.ps1
pause
