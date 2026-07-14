@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"
set "DEST_DIR=%ROOT_DIR%\Goylord-Client\third_party\onevpl"
set "DEST_HEADER=%DEST_DIR%\include\vpl\mfxvideo.h"
if "%ONEVPL_REPO%"=="" set "ONEVPL_REPO=https://github.com/oneapi-src/oneVPL.git"
if "%ONEVPL_REF%"=="" set "ONEVPL_REF=v2.15.0"
if exist "%DEST_HEADER%" if /I not "%~1"=="--force" exit /b 0
where git >nul 2>&1 || (echo git is required to vendor oneVPL headers & exit /b 1)
set "TMP_DIR=%DEST_DIR%\.onevpl.tmp"
if exist "%TMP_DIR%" rd /s /q "%TMP_DIR%"
if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
git clone --depth 1 --filter=blob:none --sparse --branch "%ONEVPL_REF%" "%ONEVPL_REPO%" "%TMP_DIR%" || goto :err
git -C "%TMP_DIR%" sparse-checkout set --no-cone api/vpl/ LICENSE || goto :err
if exist "%DEST_DIR%\include" rd /s /q "%DEST_DIR%\include"
mkdir "%DEST_DIR%\include"
xcopy /e /i /q /y "%TMP_DIR%\api\vpl" "%DEST_DIR%\include\vpl" >nul || goto :err
copy /y "%TMP_DIR%\LICENSE" "%DEST_DIR%\LICENSE" >nul || goto :err
rd /s /q "%TMP_DIR%"
echo Cached Intel oneVPL %ONEVPL_REF% headers
exit /b 0
:err
if exist "%TMP_DIR%" rd /s /q "%TMP_DIR%"
echo Failed to fetch Intel oneVPL headers
exit /b 1
