@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PY=%~dp0..\..\..\python_embeded\python.exe"
if not exist "%PY%" set "PY=%~dp0..\..\..\.venv\Scripts\python.exe"
if not exist "%PY%" set "PY=%~dp0..\..\..\venv\Scripts\python.exe"
if not exist "%PY%" set "PY=python"

set "IMAGE_DIR=%~1"
if not defined IMAGE_DIR (
    echo Drag a folder of PNG, JPEG or WebP images onto this batch file,
    echo or paste the folder path below.
    set /p "IMAGE_DIR=Image folder: "
)
set "IMAGE_DIR=%IMAGE_DIR:"=%"

set "LIBRARY=%~2"
if not defined LIBRARY set "LIBRARY=styles/novoloko_all_yaml_styles.yaml"

set "SIZE=%~3"
if not defined SIZE (
    echo.
    echo Preview size:
    echo   1. 512 x 512  ^(recommended^)
    echo   2. 1024 x 1024
    choice /c 12 /n /m "Choose 1 or 2: "
    if errorlevel 2 (set "SIZE=1024") else set "SIZE=512"
)
if not "%SIZE%"=="512" if not "%SIZE%"=="1024" (
    echo Size must be 512 or 1024.
    pause
    exit /b 1
)

set "MODE=%~4"
if not defined MODE (
    echo.
    echo Matching mode:
    echo   1. Match each filename to its style name  ^(safest^)
    echo   2. Match sorted images to style-library order
    choice /c 12 /n /m "Choose 1 or 2: "
    if errorlevel 2 (set "MODE=order") else set "MODE=name"
)

echo.
echo Populating NovoLoko previews...
echo Library: %LIBRARY%
echo Size:    %SIZE%x%SIZE%
echo Mode:    %MODE%
echo.

"%PY%" "%~dp0tools\populate_style_previews.py" ^
    --images "%IMAGE_DIR%" ^
    --library "%LIBRARY%" ^
    --size "%SIZE%" ^
    --mode "%MODE%" ^
    --replace
set "RESULT=%ERRORLEVEL%"

echo.
if "%RESULT%"=="0" (
    echo Style previews populated successfully.
    echo Restart ComfyUI and press Ctrl+F5 if the browser was already open.
) else (
    echo Preview population finished with an error. Review the report above.
)
pause
exit /b %RESULT%
