@echo off
setlocal EnableExtensions
call "%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" || exit /b 1
set "PATH=D:\nvm\nodejs;%USERPROFILE%\.cargo\bin;%ProgramFiles(x86)%\Windows Kits\10\bin\10.0.26100.0\x64;%SystemRoot%\System32;%PATH%"
set "CARGO_TARGET_DIR=C:\temp\yunnotes-target3"
set "CARGO_BUILD_JOBS=1"
cd /d "%~dp0"
node "%~dp0node_modules\@tauri-apps\cli\tauri.js" build
exit /b %ERRORLEVEL%
