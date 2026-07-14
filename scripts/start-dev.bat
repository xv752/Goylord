@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT=%%~fI\"

if not defined NO_PRINTING set NO_PRINTING=false


echo === Ensuring server deps (Bun) ===
pushd "%ROOT%Goylord-Server"
echo [server] bun install...
call bun install
popd

echo === Ensuring client dependencies (Go) ===
if not exist "%ROOT%Goylord-Client\third_party\onevpl\include\vpl\mfxdispatcher.h" (
	echo [client] Intel oneVPL headers are missing; fetching them...
	call "%SCRIPT_DIR%vendor-onevpl-headers.bat"
	if errorlevel 1 (
		echo [client] Failed to provision Intel oneVPL headers.
		exit /b 1
	)
)
pushd "%ROOT%Goylord-Client"
if exist go.mod (
	echo [client] go mod tidy...
	go mod tidy
)
popd

echo === Launching windows ===
rem Bind server to all interfaces for remote access
set HOST=0.0.0.0
set PORT=5173
set GOYLORD_AGENT_TOKEN=dev-token-insecure-local-only
set GOYLORD_DISABLE_AGENT_AUTH=true
set LOG_LEVEL=debug
set CGO_ENABLED=1

start "Goylord-Server" cmd /k "cd /d ""%ROOT%Goylord-Server"" && set GOYLORD_DISABLE_AGENT_AUTH=true && set GOYLORD_AGENT_TOKEN=dev-token-insecure-local-only && set LOG_LEVEL=debug && set NODE_ENV=development && bun install && bun run start"
timeout /t 3 /nobreak >nul
start "Goylord-Client" cmd /k "cd /d ""%ROOT%Goylord-Client"" && set CGO_ENABLED=1 && set GOYLORD_SERVER=wss://localhost:5173 && set GOYLORD_AGENT_TOKEN=dev-token-insecure-local-only && set GOYLORD_TLS_INSECURE_SKIP_VERIFY=true && set GOYLORD_MODE=dev && set GOYLORD_CAPTURE_METRICS=true && set GOINSECURE=* && set GOSUMDB=off && set GOPROXY=https://proxy.golang.org,direct && go mod tidy && go run ./cmd/agent"

echo Done. Terminals stay open (/k) for logs.
endlocal
