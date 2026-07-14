# Features Overview

**Version:** 2.5.3

## Remote Desktop

- Screen capture with cursor overlay
- H.264 hardware encoding (NVENC, AMF, Intel oneVPL, Media Foundation)
- JPEG fallback with quality/resolution controls
- Mouse and keyboard input relay
- Multi-monitor support
- Clipboard sync (bidirectional)
- Three transport modes: Canvas, WebRTC P2P, WebRTC Relayed
- Remote desktop recording

## HVNC (Hidden VNC / Backstage Mode)

- Hidden desktop via NT API hooking (BackstageInjection)
- DXGI frame capture via shared memory (BackstageCapture)
- Reflective DLL injection into child processes
- Browser cloning (Chrome, Firefox, Edge)
- File system redirection at kernel level
- Explorer auto-start on hidden desktop
- Multi-user HVNC pausing
- Image caching for performance

## Console

- Interactive shell (cmd.exe / bash) via xterm.js
- Real-time WebSocket streaming
- Status indicators (online/offline/closed)
- Reconnect, interrupt (Ctrl+C), clear screen
- Pre-filled command support

## File Management

- Full file browser with directory listing
- Upload/download files
- Drag-and-drop uploading
- Image preview and PDF viewing
- File sharing between operators
- Sorting and filtering options
- Download from URLs
- Per-user file browser sessions

## Process Management

- List running processes with details
- Kill processes
- Context menu actions
- Running process indicator in viewer

## Command Execution

- Interactive shell (cmd.exe / bash)
- One-shot command execution
- Silent execution mode
- Command history

## Keylogger

- Platform-specific keystroke capture
- Server-side searchable archive (SQLite FTS5)
- Offline keylogger (stores while offline)
- Archive file management

## Webcam

- Camera capture with H264 encoding
- Quality slider
- Screenshot capture from webcam
- WebRTC streaming for low latency
- Show if users have webcams

## Audio

- Desktop audio capture and streaming
- Voice (microphone) capture and streaming via winmm.dll
- Audio controls (volume up/down)
- Mute support

## WebRTC

- P2P streaming via Pion (Go)
- WHIP/WHEP relay via MediaMTX
- Three transport modes (Canvas/P2P/Relayed)
- ICE/SDP signaling relay

## Chat System

- Real-time chat between operators
- File sharing in chat
- Chat history persistence

## Plugin System

- **Server-side**: Bun worker threads, custom UI pages/buttons
- **WASM (Plugin 2.0)**: Sandboxed on agents via wazero
- **Native**: C/C++/Go/Rust shared libraries
- **Signing**: Ed25519 key-based verification
- **Permissions**: Declared permission model
- **Badges**: Plugin badges for UI
- **Build hooks**: Custom build page functionality
- **Metadata**: Plugin metadata stored per-client

## Build System

- On-demand cross-compilation for all platforms
- Web UI builder with configuration options
- Obfuscation (garble + control flow flattening + string obfuscation)
- Shellcode mode (Donut + SGN)
- Binder (embed additional files)
- Custom output names and icons
- UPX compression
- Build profiles (saved configurations)
- Auto build tags
- Toolchain auto-download (mingw, Android NDK, etc.)

## Security

- JWT authentication with refresh tokens
- OIDC/SSO (Authentik, Authelia, Keycloak, etc.)
- MFA (Multi-Factor Authentication)
- RBAC with granular permissions (admin/operator/viewer)
- Permission groups for bulk permission management
- Ed25519 challenge-response enrollment
- TLS (self-signed, Let's Encrypt, reverse proxy)
- Encrypted logs
- IP ban system with GeoIP tracking
- Rate limiting
- Audit logging

## Agent Features

- Multi-server failover with exponential backoff
- Solana blockchain-based server URL resolution
- Single-instance mutex
- Critical process protection (Windows)
- Privilege escalation (UAC bypass / sudo)
- Persistence mechanisms (registry, startup, WinRE)
- Self-update capability
- Crash logging and reporting
- System info collection (CPU, GPU, RAM, battery, admin status)
- Active window detection
- SOCKS5 proxy (tunnel traffic through agent)
- Hardware filtering support (CPU, GPU, RAM metadata)

## Notifications

- Browser push notifications (web-push)
- Telegram bot integration
- Discord webhook integration
- Screenshot capture on notification triggers
- Configurable notification filters
- Mute per-client

## Dashboard

- Real-time metrics and charts (Chart.js)
- Gridstack widget layout
- Client cards with status indicators
- Globe metrics (geolocation)
- Active sessions donut graph
- Client history graphs
- Bookmark clients
- Sorting and filtering (by country, OS, status, group, CPU, GPU, RAM, webcam)
- Fuzzy search (Fuse.js)
- Command palette
- Hardware dropdown filters (distinct values from DB)

## Backup & Restore

- Export full configuration as ZIP
- Import configuration from ZIP
- Pure JS CRC32 + ZIP implementation
- Settings page UI for export/import

## SPA Soft-Navigation

- Client-side router replaces body without full page reload
- Persistent elements across navigations (sidebar, mobile bar, modals)
- Stale navigation detection via `navSeq` counter
- `AbortController` for cancelling stale fetches
- `pagehide` event for cleaning up page resources
- Module scripts re-execute with fresh instances

## Customization

- Custom login branding (logo, text, colors)
- Custom CSS for the web UI
- Configurable via environment variables
- Import/export settings
- Sticky settings (build, remote desktop, etc.)

## Deployment

- Docker (multi-arch: amd64 + arm64)
- Docker Compose (Linux, Windows/macOS variants)
- No-Docker (direct Bun + Go)
- Production packaging scripts
- GitHub Actions CI/CD
- Auto-publish to GHCR
- Desktop app releases (Tauri NSIS/DMG/AppImage)
