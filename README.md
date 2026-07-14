<p align="center">
  <img src="https://raw.githubusercontent.com/xv752/Goylord/refs/heads/main/Goylord-Server/public/assets/goylord.png" alt="Goylord" width="280" />
</p>

# Goylord

Remote access and fleet management platform. TypeScript server on Bun, Go agent, Tauri desktop app. Operators manage targets through a web panel; agents connect over encrypted WebSockets.

**Version:** 0.0.0

---

## Quick Start (Docker)

Pick your OS. Each section is self-contained.

After first start, open `https://localhost:5173`. Default login: `admin` / `adminadmin`.

### Windows

```powershell
winget install -e --id Docker.DockerDesktop
git clone https://github.com/xv752/Goylord.git
cd Goylord
docker compose -f docker-compose.windows.yml up -d
```

### Linux

```bash
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
git clone https://github.com/xv752/Goylord.git
cd Goylord
docker compose up -d
```

### macOS

```bash
brew install --cask docker
git clone https://github.com/xv752/Goylord.git
cd Goylord
docker compose -f docker-compose.windows.yml up -d
```

### Update

```bash
docker compose down && docker compose pull && docker compose up -d
```

### Building Your Own Docker Image

Build the server image locally:

```bash
git clone https://github.com/xv752/Goylord.git
cd Goylord

# Build the image
docker build -t goylord:latest .

# Run it
docker compose up -d
```

Or build with a custom tag:

```bash
docker build -t myregistry/goylord:v1.0.0 .
```

To push to GitHub Container Registry (GHCR):

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u xv752 --password-stdin

# Tag and push
docker tag goylord:latest ghcr.io/xv752/goylord:latest
docker push ghcr.io/xv752/goylord:latest
```

The Dockerfile is multi-stage: Stage 1 builds assets + HVNC DLLs, Stage 2 is a slim runtime image. Toolchains (mingw, Android NDK, etc.) are downloaded on first agent build by the server and cached in the `/app/data` volume.

---

## No Docker

Prerequisites: Bun, Go 1.21+

```bash
# Development (server + agent)
scripts/start-dev.bat        # Windows
./scripts/start-dev.sh       # Linux/macOS

# Production
scripts/start-prod.bat       # Windows
./scripts/start-prod.sh      # Linux/macOS
```

---

## Architecture

```
┌─────────────────────┐
│   Goylord-Server   │  TypeScript / Bun  (port 5173)
│   Web UI + REST API │
└────────┬────────────┘
         │
   ┌─────┼─────────────┐
   │     │             │
 WebSocket  HTTP/API  WebRTC
   │     │             │
┌──┴──┐  │      ┌──────┴──────┐
│Agent│  │      │  MediaMTX   │
│(Go) │  │      │  (sidecar)  │
└─────┘  │      └─────────────┘
         │
   ┌─────┴─────────┐
   │   Desktop App  │
   │   (Tauri 2)    │
   └────────────────┘
```

| Connection | Protocol | Auth |
|---|---|---|
| Server ↔ Agent | WebSocket (binary msgpack) | Agent token + Ed25519 enrollment |
| Server ↔ Desktop | System webview (loads web UI) | JWT (from web login) |
| Server ↔ WebRTC | SDP/ICE relay or WHIP/WHEP | JWT |

---

## Features

### Remote Access
- Remote desktop with H.264 hardware encoding (NVENC, AMF, Intel oneVPL, Media Foundation)
- HVNC (hidden desktop) via reflective DLL injection
- Interactive console (cmd.exe / bash)
- Voice capture (microphone)
- Desktop audio capture
- Webcam capture with H.264 encoding
- Three transport modes: Canvas, WebRTC P2P, WebRTC Relayed

### Fleet Management
- Real-time dashboard with metrics charts (Chart.js, Gridstack)
- Client cards with status, hardware info, groups
- Sorting, filtering (status, OS, country, group, CPU, GPU, RAM, webcam)
- Fuzzy search (Fuse.js)
- Command palette for quick navigation
- Bookmark clients
- Multi-select bulk actions

### File & Process Management
- Full file browser with upload/download, drag-and-drop, image preview
- Process manager (list/kill)
- File sharing between operators

### Keylogger
- Platform-specific keystroke capture
- Server-side full-text search archive (SQLite FTS5)
- Offline buffering

### Security
- JWT authentication with refresh tokens
- OIDC/SSO (Authentik, Authelia, Keycloak, etc.)
- MFA (Multi-Factor Authentication)
- RBAC (admin/operator/viewer) with granular permissions
- Ed25519 challenge-response enrollment
- TLS (self-signed, Let's Encrypt, reverse proxy)
- IP ban system with GeoIP tracking
- Rate limiting, audit logging
- Encrypted logs

### Build System
- On-demand cross-compilation via web UI
- Obfuscation (garble + control flow flattening + string obfuscation)
- Shellcode mode (Donut + SGN)
- Binder (embed additional files)
- UPX compression
- Build profiles (saved configurations)
- Auto-download toolchains (mingw, Android NDK, etc.)

### Plugin System
- **Server-side**: Bun worker threads, custom UI pages
- **WASM (Plugin 2.0)**: Sandboxed on agents via wazero
- **Native**: C/C++/Go/Rust shared libraries
- Ed25519 signing, declared permissions

### Notifications
- Browser push notifications
- Telegram bot integration
- Discord webhooks
- Screenshot capture on triggers

### Agent Features
- Multi-server failover with exponential backoff
- Solana blockchain-based server URL resolution
- Single-instance mutex, critical process protection
- Privilege escalation (UAC bypass / sudo)
- Persistence (registry, startup, WinRE)
- Self-update capability
- SOCKS5 proxy
- Crash logging and reporting

### Deployment
- Docker multi-arch (amd64 + arm64) via GHCR
- Docker Compose (Linux, Windows/macOS variants)
- No-Docker (direct Bun + Go)
- Tauri desktop app (Windows NSIS, macOS DMG, Linux AppImage)

---

## Environment Variables

See `.env.example` for all configurable options. Key categories:

| Category | Variables |
|---|---|
| Auth | `GOYLORD_USER`, `GOYLORD_PASS` |
| OIDC/SSO | `GOYLORD_OIDC_ENABLED`, `GOYLORD_OIDC_ISSUER`, etc. |
| TLS | `GOYLORD_TLS_CERTBOT_ENABLED`, `GOYLORD_TLS_OFFLOAD` |
| Branding | `GOYLORD_LOGIN_BRAND_NAME`, `GOYLORD_BRAND_ACCENT_COLOR` |
| Notifications | `GOYLORD_TELEGRAM_BOT_TOKEN`, `GOYLORD_DISCORD_WEBHOOK_URL` |
| Build | `GOYLORD_CLIENT_BUILD_CACHE_DIR` |
| Proxy | `GOYLORD_TRUST_PROXY` |

---

## WebRTC

Three transport modes in the remote desktop viewer:

- **Canvas** (default): H.264/JPEG over WebSocket. Works everywhere.
- **WebRTC P2P**: Browser ↔ agent direct. Lowest latency. Fails on symmetric NAT.
- **WebRTC Relayed**: Agent → MediaMTX → browser. Fallback when P2P can't connect.

WebRTC is opt-in per agent build. Enable in the builder UI or use build tag:

```bash
go build -tags goylord_webrtc ./cmd/agent
```

### MediaMTX

Compose starts an `goylord-mediamtx` sidecar. Needs UDP `8189` reachable from operators.

Set `GOYLORD_WEBRTC_ADDITIONAL_HOSTS` for LAN/public access:

```env
GOYLORD_WEBRTC_ADDITIONAL_HOSTS=192.168.1.42
```

---

## Desktop App

Tauri 2 native app (~10MB vs ~80MB Electron). Provides:

- Connection screen with TLS toggle
- Remembers last server
- Popup windows for console, HVNC, audio (inheriting auth cookies)

Build:

```bash
scripts/build-desktop.bat    # Windows
scripts/build-desktop.sh     # Linux/macOS
```

---

## License

Apache 2.0
