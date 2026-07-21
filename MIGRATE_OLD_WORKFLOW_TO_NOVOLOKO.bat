@echo off
setlocal
if "%~1"=="" (
  echo Drag an older ComfyUI workflow JSON onto this file.
  pause
  exit /b 1
)
set "PY=%~dp0..\..\..\python_embeded\python.exe"
if not exist "%PY%" set "PY=python"
"%PY%" "%~dp0tools\migrate_workflow_to_novoloko.py" "%~1"
pause
