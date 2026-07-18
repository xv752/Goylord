# Build & Deployment

**Version:** 0.0.5

## Scripts

```
scripts/
├── start-dev.bat / .sh / .command   # Start server + client in dev mode
├── start-dev-server.sh              # Start server only (dev)
├── start-dev-client.sh              # Start client only (dev)
├── start-prod.bat / .sh             # Production: build + run
├── start-prod-tuned.bat             # Tuned production start
├── build-clients.bat                # Cross-compile agents for all platforms
├── build-prod-package.bat / .sh     # Build complete production package
├── build-desktop.bat / .sh          # Build Tauri desktop app
├── build-backstage-dll.bat / .sh    # Build BackstageInjection DLL (MSVC/MinGW)
├── build-backstage-capture-dll.bat / .sh  # Build BackstageCapture DLL
├── generate-certs.bat / .sh         # Generate self-signed TLS certificates
├── vendor-nvcodec-headers.bat / .sh # Fetch NVIDIA NVENC SDK headers
├── vendor-amf-headers.bat / .sh     # Fetch AMD AMF SDK headers
├── vendor-onevpl-headers.bat / .sh  # Fetch Intel oneVPL SDK headers
└── obfuscate-strings.py             # String obfuscation (Python)
```

## Docker Deployment (Recommended)

```bash
# Quick start
docker compose up -d

# Windows/macOS (bridge networking)
docker compose -f docker-compose.windows.yml up -d

# Minimal (server only, no WebRTC)
docker compose -f docker-compose.quickstart.yml up -d
```

### Docker Architecture

**Dockerfile** (multi-stage):
1. **Builder stage**: Installs Go, garble (obfuscator), Donut (shellcode), SGN (encoder), builds HVNC DLLs, compiles frontend
2. **Runtime stage**: Slim Bun image + Go + ffmpeg, pre-seeded Go module cache

**docker-compose.yml** (Linux):
- `goylord-server` — Main server container
- `mediamtx` — WebRTC media relay sidecar
- Uses bridge networking (port mapping: 5173, 8443, 1935, 50000–50100). Host networking is only used in `docker-compose.quickstart.yml`

**Persistent Volumes**:
- `data/` — SQLite database
- `certs/` — TLS certificates
- `build-cache/` — Agent build cache
- `plugins/` — Installed plugins

### Environment Variables

See `.env.example` for all configurable options including:
- Authentication (admin credentials, OIDC, MFA)
- TLS/SSL settings
- Build configuration
- Notification webhooks (Telegram, Discord)
- Branding/customization
- Rate limiting

## No-Docker Deployment

```bash
# Development
scripts/start-dev.bat       # Windows
scripts/start-dev.sh        # Linux/macOS

# Production
scripts/build-prod-package.bat   # Windows
scripts/build-prod-package.sh    # Linux/macOS
```

## Agent Build System

The server can build agent binaries on-demand via:
1. **Web UI**: Build page with configuration options
2. **REST API**: `/api/build` endpoint
3. **On-demand toolchains**: Downloads cross-compilation toolchains (mingw, Android NDK, etc.) on first use

### Build Options
- Target OS/Architecture
- Obfuscation (garble + control flow flattening)
- Custom output names
- Binder (embed additional files)
- Icon customization
- UPX compression
- Shellcode mode (Donut + SGN)
- Hardware encoding (NVENC, AMF, Intel oneVPL)
- Build tags for feature toggling
- Build profiles (saved configurations)

## CI/CD (GitHub Actions)

| Workflow | Trigger | Purpose |
|---|---|---|
| `tests.yml` | PR, push | Run server (Bun) + client (Go) tests on ubuntu/macos/windows |
| `docker-publish.yml` | Manual | Build DLLs + multi-arch Docker image → GHCR |
| `desktop-release.yml` | Push to main (Desktop changes) | Build Tauri NSIS installer → GitHub Release |

## Testing

```bash
# Server tests (500 pass, 5 fail pre-existing)
cd Goylord-Server && bun test

# E2E tests (59/59 pass)
bun test-e2e.ts

# Type checking
cd Goylord-Server && bun run typecheck
```
