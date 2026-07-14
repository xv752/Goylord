# Tech Stack

**Version:** 2.5.3

## Languages & Runtimes

| Component | Language | Runtime/Compiler |
|---|---|---|
| Server | TypeScript | Bun |
| Agent/Client | Go 1.26 | Go compiler + garble (obfuscation) |
| Desktop App | Rust + HTML/CSS/JS | Tauri 2 (system webview) |
| HVNC DLLs | C | MSVC / MinGW |
| Plugins | C, C++, Go, Rust, TinyGo, TypeScript | wazero (WASM), Bun (server), native shared libs |
| Scripts | Python, Shell, Batch | Python 3, Bash, PowerShell |

## Core Dependencies

### Server (Goylord-Server)
| Package | Purpose |
|---|---|
| Bun | Runtime + built-in SQLite + WebSocket |
| jose | JWT token creation/verification |
| geoip-lite | IP geolocation |
| web-push | Push notification delivery |
| winston | Structured logging |
| adm-zip | Archive creation/extraction |
| fuse.js | Fuzzy client search |
| @solana/web3.js | Solana blockchain (server URL resolution) |
| qrcode | QR code generation |
| @msgpack/msgpack | Binary serialization |
| ansi-to-html | ANSI terminal color rendering |
| cytoscape | Client relationship graphs |
| gridstack | Dashboard widget layout |
| msgpackr | High-performance msgpack |
| uuid | UUID generation |

### Frontend
| Package | Purpose |
|---|---|
| Tailwind CSS 4 | Utility-first CSS |
| xterm.js | Terminal emulator |
| Monaco Editor | Code/script editor |
| Chart.js | Dashboard metrics charts |
| Tabulator | Data tables |
| highlight.js | Syntax highlighting |
| Font Awesome 6 | Icons |
| Gridstack | Dashboard widget layout |
| anime.js | Animations |
| CodeMirror | Alternative code editor |

### Client (Goylord-Client)
| Package | Purpose |
|---|---|
| nhooyr.io/websocket | WebSocket client |
| pion/webrtc/v4 | WebRTC (P2P, WHIP relay) |
| tetratelabs/wazero | WASM runtime (plugins) |
| kbinani/screenshot | Screen capture |
| vmihailenco/msgpack | Binary serialization |
| golang.org/x/crypto | Ed25519 crypto |
| lxn/win | Win32 API (Windows) |
| jezek/xgb | X11 (Linux) |
| gen2brain/malgo | Audio (macOS) |
| Kirizu-Official/windows-camera-go | Windows camera capture |

### Desktop (Goylord-Desktop)
| Package | Purpose |
|---|---|
| Tauri 2 | Native app framework |
| reqwest | HTTP client (connection check) |
| serde | Serialization |
| Inter | UI font |

## Build Tools

| Tool | Purpose |
|---|---|
| garble | Go source code obfuscation |
| Donut | .NET/csharp -> shellcode converter |
| SGN (Shikata Ga Nai) | Polymorphic shellcode encoder |
| UPX | Executable compression |
| MinHook | Function hooking (HVNC DLLs) |
| MSVC | Windows DLL compilation |
| MediaMTX | WebRTC media relay |
| k6 | Load testing |
| Renovate | Dependency updates |

## Infrastructure

| Component | Technology |
|---|---|
| Container | Docker (multi-arch: amd64, arm64) |
| Registry | GitHub Container Registry (ghcr.io) |
| CI/CD | GitHub Actions |
| Database | SQLite with FTS5 full-text search |
| Auth | JWT + OIDC/SSO + MFA + RBAC |
| TLS | Self-signed / Let's Encrypt / reverse proxy |
| Streaming | WebSocket + WebRTC (Pion) |
| SPA Navigation | Custom soft-nav router (client-side HTML swap) |
