@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT=%%~fI\"

echo === Building Goylord Desktop (Tauri) ===
pushd "%ROOT%Goylord-Desktop"

where bun >nul 2>&1
if errorlevel 1 (
  echo error: bun is required ^(https://bun.sh^)
  goto :err
)
where cargo >nul 2>&1
if errorlevel 1 (
  echo error: rust toolchain is required ^(https://rustup.rs^)
  goto :err
)

call bun install || goto :err
call bun run vendor || goto :err
call bun run build:win || goto :err
echo === Done — bundle output: Goylord-Desktop\src-tauri\target\release\bundle\ ===
popd
pause
endlocal
exit /b 0

:err
popd >nul 2>&1
endlocal
exit /b 1
