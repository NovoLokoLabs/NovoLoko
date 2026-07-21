@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo NovoLoko install diagnostic
echo.
for %%P in (
    "%~dp0..\..\..\python_embeded\python.exe"
    "%~dp0..\..\..\.venv\Scripts\python.exe"
    "%~dp0..\..\..\venv\Scripts\python.exe"
    "%~dp0..\..\.venv\Scripts\python.exe"
    "%~dp0..\..\venv\Scripts\python.exe"
) do (
    if exist "%%~fP" (
        echo Testing: %%~fP
        "%%~fP" -c "import sys; print(sys.executable); import yaml; print('YAML OK'); import faster_whisper; print('Whisper OK'); from kokoro import KPipeline; print('Kokoro OK')"
        echo.
    )
)
pause
