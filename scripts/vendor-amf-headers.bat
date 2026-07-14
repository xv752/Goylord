@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "DEST_DIR=%ROOT_DIR%\Goylord-Client\third_party\amf"
set "DEST_HEADER=%DEST_DIR%\include\core\Factory.h"
if "%AMF_REPO%"=="" set "AMF_REPO=https://github.com/GPUOpen-LibrariesAndSDKs/AMF.git"
if "%AMF_REF%"=="" set "AMF_REF=v1.5.2"

if exist "%DEST_HEADER%" if /I not "%~1"=="--force" (
    echo AMF headers already cached: "%DEST_DIR%\include"
    exit /b 0
)

where git >nul 2>&1 || (echo git is required to vendor AMF headers & exit /b 1)
set "TMP_DIR=%DEST_DIR%\.amf-sdk.tmp"
if exist "%TMP_DIR%" rd /s /q "%TMP_DIR%"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"

git clone --depth 1 --filter=blob:none --sparse --branch "%AMF_REF%" "%AMF_REPO%" "%TMP_DIR%" || goto :err
git -C "%TMP_DIR%" sparse-checkout set --no-cone amf/public/include/ LICENSE.txt || goto :err
if exist "%DEST_DIR%\include" rd /s /q "%DEST_DIR%\include"
xcopy /e /i /q /y "%TMP_DIR%\amf\public\include" "%DEST_DIR%\include" >nul || goto :err
copy /y "%TMP_DIR%\LICENSE.txt" "%DEST_DIR%\LICENSE.txt" >nul || goto :err
rd /s /q "%TMP_DIR%"
echo Cached AMD AMF %AMF_REF% headers in "%DEST_DIR%\include"
exit /b 0

:err
if exist "%TMP_DIR%" rd /s /q "%TMP_DIR%"
echo Failed to fetch AMD AMF headers
exit /b 1
