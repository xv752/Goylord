@echo off
setlocal enabledelayedexpansion

set "PLUGIN_DIR=%~dp0"
set "PLUGIN_NAME=sample-build-hooks"
set "ZIP_OUT=%PLUGIN_DIR%%PLUGIN_NAME%.zip"

if exist "%ZIP_OUT%" del /f /q "%ZIP_OUT%"

pushd "%PLUGIN_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$zip = '%ZIP_OUT%'; $items = @('config.json', '%PLUGIN_NAME%.html', '%PLUGIN_NAME%.css', '%PLUGIN_NAME%.js', 'server.js'); Compress-Archive -Path $items -DestinationPath $zip -Force"
set "ZIP_STATUS=%ERRORLEVEL%"
popd
if not "%ZIP_STATUS%"=="0" exit /b %ZIP_STATUS%

if defined PLUGIN_SIGN_KEY (
  where bun >nul 2>&1
  if not errorlevel 1 (
    echo [sign] Signing plugin with key: %PLUGIN_SIGN_KEY%
    bun run "%~dp0..\..\Goylord-Server\scripts\plugin-sign.ts" --key "%PLUGIN_SIGN_KEY%" "%ZIP_OUT%"
  ) else (
    echo [warn] bun not found, skipping plugin signing
  )
)

echo [ok] %ZIP_OUT%
