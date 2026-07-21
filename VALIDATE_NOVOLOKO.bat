@echo off
setlocal
cd /d "%~dp0"
echo.
echo =============================================
echo   NovoLoko project validation
echo =============================================
echo.
python tools\validate_project.py
if errorlevel 1 goto :failed
python -m unittest discover -s tests -v
if errorlevel 1 goto :failed
echo.
echo NovoLoko validation completed successfully.
pause
exit /b 0

:failed
echo.
echo NovoLoko validation failed. Review the errors above.
pause
exit /b 1
