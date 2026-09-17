@echo off
setlocal
REM Ensure Rust cargo is on PATH (new terminals after rustup install)
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

REM Windows resource compiler (needed for some Tauri builds)
if exist "%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.26100.0\x64\rc.exe" (
  set "PATH=%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.26100.0\x64;%PATH%"
)

where cargo >nul 2>&1
if errorlevel 1 (
  echo [ERROR] cargo not found. Install Rust: https://rustup.rs
  echo Then close and reopen the terminal, or run:
  echo   set PATH=%%USERPROFILE%%\.cargo\bin;%%PATH%%
  exit /b 1
)

cd /d "%~dp0"
pnpm tauri dev
