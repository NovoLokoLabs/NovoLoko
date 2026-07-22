@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo   NovoLoko v3.2.7 - Optional Voice, Kokoro and YAML Setup
echo ============================================================
echo.

set "PYTHON_EXE="
if exist "%~dp0python_path.txt" (
    set /p PYTHON_EXE=<"%~dp0python_path.txt"
    if defined PYTHON_EXE if not exist "%PYTHON_EXE%" set "PYTHON_EXE="
)

for %%P in (
    "%~dp0..\..\..\python_embeded\python.exe"
    "%~dp0..\..\..\.venv\Scripts\python.exe"
    "%~dp0..\..\..\venv\Scripts\python.exe"
    "%~dp0..\..\.venv\Scripts\python.exe"
    "%~dp0..\..\venv\Scripts\python.exe"
) do (
    if not defined PYTHON_EXE if exist "%%~fP" set "PYTHON_EXE=%%~fP"
)

if not defined PYTHON_EXE (
    for /f "delims=" %%P in ('where python 2^>nul') do if not defined PYTHON_EXE set "PYTHON_EXE=%%P"
)

if not defined PYTHON_EXE (
    echo ERROR: ComfyUI Python was not found.
    echo Put its full python.exe path in python_path.txt beside this file, then retry.
    pause
    exit /b 1
)

echo Using: %PYTHON_EXE%
"%PYTHON_EXE%" -m pip install -r "%~dp0requirements.txt"
if errorlevel 1 goto :failed
"%PYTHON_EXE%" -m pip install -r "%~dp0requirements-voice.txt"
if errorlevel 1 goto :failed

"%PYTHON_EXE%" -c "from faster_whisper import WhisperModel; from kokoro import KPipeline; import soundfile, yaml; print('NovoLoko optional dependencies are ready.')"
if errorlevel 1 goto :failed

echo.
echo SUCCESS. Restart ComfyUI completely and press Ctrl+F5.
pause
exit /b 0

:failed
echo.
echo INSTALL FAILED. Check that the Python path above belongs to this ComfyUI installation.
pause
exit /b 1
