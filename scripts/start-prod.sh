#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
SERVER_DIR="$ROOT/Goylord-Server"
BUN_BIN="${BUN_BIN:-bun}"

cd "$SERVER_DIR"
if ! command -v "$BUN_BIN" >/dev/null 2>&1; then
	echo "[server] bun not found. Set BUN_BIN to your bun binary or install bun for this environment." >&2
	exit 1
fi
echo "[server] using bun at: $(command -v $BUN_BIN)"

echo "[build] bun install..."
"$BUN_BIN" install

echo "[build] building Tailwind CSS..."
"$BUN_BIN" run build:css

echo "[build] building server bundle..."
"$BUN_BIN" run build

echo "[build] compiling Linux production executable..."
"$BUN_BIN" run build:prod:linux

echo "[build] copying Goylord-Client source for runtime builds..."
mkdir -p "$SERVER_DIR/dist/Goylord-Client"
rsync -a --exclude='build' --exclude='.git' --exclude='.vscode' "$ROOT/Goylord-Client/" "$SERVER_DIR/dist/Goylord-Client/" 2>/dev/null \
	|| {
		rm -rf "$SERVER_DIR/dist/Goylord-Client"
		cp -a "$ROOT/Goylord-Client" "$SERVER_DIR/dist/Goylord-Client"
		rm -rf "$SERVER_DIR/dist/Goylord-Client/build" "$SERVER_DIR/dist/Goylord-Client/.git" "$SERVER_DIR/dist/Goylord-Client/.vscode"
	}

echo "[server] starting compiled executable..."
PORT="${PORT:-5173}" \
HOST="${HOST:-0.0.0.0}" \
GOYLORD_USER="${GOYLORD_USER:-admin}" \
GOYLORD_PASS="${GOYLORD_PASS:-admin}" \
LOG_LEVEL="${LOG_LEVEL:-info}" \
NODE_ENV="${NODE_ENV:-production}" \
GOYLORD_ROOT="$SERVER_DIR" \
"$SERVER_DIR/dist/goylord-server-linux-x64"
