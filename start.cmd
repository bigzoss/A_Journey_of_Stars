@echo off
setlocal
cd /d "%~dp0"
py -3 -c "import sys; sys.exit(sys.version_info < (3, 9))" >nul 2>nul
if not errorlevel 1 (
    py -3 app.py --open
    goto done
)
python -c "import sys; sys.exit(sys.version_info < (3, 9))" >nul 2>nul
if not errorlevel 1 (
    python app.py --open
    goto done
)
set "LUMA_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%LUMA_PYTHON%" (
    "%LUMA_PYTHON%" app.py --open
    goto done
)
echo Please install Python 3.9 or newer, then run start.cmd again.
pause
exit /b 1
:done
if errorlevel 1 pause
