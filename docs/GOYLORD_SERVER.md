# Goylord-Server

TypeScript server running on **Bun** that hosts the web panel, manages agent connections, handles authentication, and orchestrates agent builds.

**Version:** 2.5.3

## Directory Layout

```
Goylord-Server/
├── package.json                     # v2.5.3, Bun runtime, all dependencies
├── tailwind.config.js               # Tailwind CSS 4 config
├── tsconfig.json                    # ES2022 target, Bun types
├── scripts/
│   ├── vendor.ts                    # Copies frontend assets into dist
│   ├── minify-public.ts             # Minifies public JS bundles
│   ├── plugin-sign.ts               # Ed25519 plugin signing tool
│   └── seed_fake_clients.py         # Dev: seeds test clients into DB
├── src/
│   ├── index.ts                     # Entry point → imports main-server.ts
│   ├── main-server.ts               # Core: HTTP routes, WS handlers, TLS, plugins, builds (~874 lines)
│   ├── types.ts                     # ClientInfo, ListFilters, ListItem, ListResult, ClientRole
│   ├── version.ts                   # SERVER_VERSION = "2.5.3"
│   ├── auth.ts                      # JWT auth (jose), session management, password verification
│   ├── rbac.ts                      # Role-Based Access Control (admin/operator/viewer)
│   ├── users.ts                     # User management, feature permissions, client access
│   ├── db/
│   │   ├── schema.ts                # SQLite schema: 25 tables with FTS5 full-text search
│   │   ├── connection.ts            # SQLite connection setup (PRAGMA foreign_keys = ON)
│   │   └── repositories.ts          # Data access layer for all tables
│   ├── db.ts                        # Re-exports from db/repositories.ts
│   ├── wsHandlers.ts                # WS message handlers: hello, ping, pong, frame, thumbnails
│   ├── wsValidation.ts              # WS message validation and size limits
│   ├── metrics.ts                   # Server metrics collection
│   ├── auditLog.ts                  # Audit logging
│   ├── mfa.ts                       # Multi-factor authentication
│   ├── certGenerator.ts             # TLS certificate generation
│   ├── thumbnails.ts                # Client screenshot thumbnail management
│   ├── clientManager.ts             # In-memory client state management
│   ├── client-db-sync.ts            # Batched sync: in-memory → SQLite
│   ├── config.ts                    # Config loading (env vars, config.json) — 1500+ lines
│   ├── logger.ts                    # Winston-based logging
│   ├── styles.css                   # Tailwind CSS input
│   ├── server/
│   │   ├── routes/                  # HTTP route handlers (40 files, 33 implementation + 7 tests)
│   │   │   ├── auth-routes.ts       # Login, register, password change
│   │   │   ├── oidc-routes.ts       # OpenID Connect / SSO
│   │   │   ├── build-routes.ts      # Agent binary build orchestration
│   │   │   ├── build-profile-routes.ts  # Saved build profiles
│   │   │   ├── deploy-routes.ts     # File deployment to agents
│   │   │   ├── enrollment-routes.ts # Agent enrollment/purgatory approval
│   │   │   ├── plugin-routes.ts     # Plugin install/manage/signing
│   │   │   ├── websocket-lifecycle-routes.ts  # WS lifecycle
│   │   │   ├── webrtc-routes.ts     # WebRTC signaling relay
│   │   │   ├── users-routes.ts      # User CRUD, permissions
│   │   │   ├── permission-groups-routes.ts  # Permission group management
│   │   │   ├── chat-routes.ts       # Chat system routes
│   │   │   ├── client-routes.ts     # Client listing, filters, hardware options
│   │   │   ├── client-command-routes.ts  # Command execution on clients
│   │   │   ├── client-group-routes.ts  # Client group management
│   │   │   ├── backup-routes.ts     # ZIP export/import of config
│   │   │   ├── saved-scripts-routes.ts  # Saved script management
│   │   │   ├── auto-scripts-routes.ts  # Auto-triggered scripts
│   │   │   ├── auto-deploy-routes.ts  # Auto-triggered deployments
│   │   │   ├── file-download-routes.ts  # File download proxy
│   │   │   ├── file-share-routes.ts  # Shared file management
│   │   │   ├── keylog-archive-routes.ts  # Keylog archive management
│   │   │   ├── notifications-config-routes.ts  # Notification settings
│   │   │   ├── misc-routes.ts       # Health, branding, feature check
│   │   │   ├── registration-routes.ts  # New user registration
│   │   │   ├── assets-routes.ts     # Static asset serving
│   │   │   ├── page-routes.ts       # HTML page serving (clean URLs)
│   │   │   ├── rd-recording-routes.ts  # Remote desktop recording
│   │   │   ├── sol-routes.ts        # Solana-related routes
│   │   │   ├── winre-routes.ts      # WinRE persistence routes
│   │   │   └── ws-upgrade-routes.ts  # WebSocket upgrade endpoints
│   │   ├── ws-console-rd-hvnc.ts    # Remote desktop, console, HVNC viewer relay
│   │   ├── ws-voice.ts              # Voice/audio streaming relay
│   │   ├── ws-desktop-audio.ts      # Desktop audio streaming relay
│   │   ├── ws-file-process-proxy-keylogger.ts  # File browser, process viewer, keylogger proxy
│   │   ├── websocket-runtime.ts     # WebSocket lifecycle management
│   │   ├── webrtc-p2p-sessions.ts   # WebRTC P2P signaling relay
│   │   ├── tls-bootstrap.ts         # TLS cert bootstrapping (self-signed, certbot)
│   │   ├── toolchain-manager.ts     # Cross-compilation toolchain downloads
│   │   ├── build-process.ts         # Agent binary build orchestration
│   │   ├── sgn-manager.ts           # Shikata Ga Nai (SGN) polymorphic encoder
│   │   ├── socks5-proxy-manager.ts  # SOCKS5 proxy for tunneling through agents
│   │   ├── notification-delivery.ts # Push notifications, webhooks, Telegram
│   │   └── plugin-runtime/          # Server-side plugin sandboxed runtime
│   ├── sessions/
│   │   └── sessionManager.ts        # WebSocket session tracking
│   └── build/
│       └── buildManager.ts          # Build queue and status management
├── public/
│   ├── index.html                   # Clients dashboard page
│   ├── console.html                 # Console page (xterm.js)
│   ├── login.html                   # Login page
│   ├── register.html                # Registration page
│   ├── settings.html                # Settings page
│   ├── purgatory.html               # Enrollment/purgatory page
│   └── assets/                      # Frontend JS/CSS/images (80 files)
│       ├── soft-nav.js              # SPA soft-navigation router
│       ├── main.js                  # Dashboard logic (1200+ lines)
│       ├── ui.js                    # Command palette, modals
│       ├── render.js                # Client grid renderer
│       ├── data.js                  # WebSocket, auto-refresh
│       ├── console.js               # xterm.js terminal
│       ├── nav.js                   # Sidebar/topbar initialization
│       ├── nav/                     # Navigation sub-modules
│       └── ...                      # 80 files total
└── vendor/                          # Auto-generated by `bun run vendor`
```

## Key Responsibilities

- **Agent Management**: Accepts WebSocket connections from Go agents, stores state in SQLite
- **Enrollment/Purgatory**: New agents require operator approval (Ed25519 challenge-response)
- **Web Dashboard**: SPA with soft-navigation, serves operator web UI
- **Remote Desktop**: Relays screen capture frames (JPEG/H264), mouse/keyboard input
- **HVNC**: Hidden VNC via BackstageInjection/BackstageCapture DLLs
- **File Browser**: Browse, upload, download files on agent machines
- **Process Manager**: List/kill processes on agents
- **Keylogger**: View keystroke logs with full-text search (FTS5)
- **Build System**: Cross-compile agent binaries on-demand (Go + garble obfuscation + Donut/SGN)
- **Plugin System**: Server-side (Bun worker threads), WASM (wazero on agent), native (shared libs)
- **WebRTC**: P2P or relayed streaming for remote desktop/audio
- **Auth**: JWT + optional OIDC/SSO + MFA + RBAC (admin/operator/viewer)
- **Notifications**: Push (web-push), Telegram, webhooks
- **Backup/Restore**: ZIP export/import of full configuration
- **Hardware Filters**: CPU/GPU dropdowns populated from distinct DB values

## Database Schema (25 tables)

`clients`, `client_groups`, `client_search_fts`, `banned_ips`, `keylog_archive_files`, `keylog_archive_fts`, `revoked_tokens`, `sessions`, `oidc_auth_states`, `oidc_identities`, `builds`, `build_claims`, `build_profiles`, `shared_ui_settings`, `branding_images`, `saved_scripts`, `notification_screenshots`, `notifications`, `push_subscriptions`, `auto_scripts`, `auto_script_runs`, `auto_deploys`, `auto_deploy_runs`, `chat_messages`, `shared_files`

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | Login (returns cookie) |
| `/api/auth/me` | GET | Current user info |
| `/api/auth/feature-check` | GET | Feature access check |
| `/api/clients` | GET | List clients with filters |
| `/api/clients/hardware-options` | GET | Distinct CPU/GPU values |
| `/api/clients/:id/console/ws` | WS | Console WebSocket |
| `/api/enrollment/stats` | GET | Purgatory stats |
| `/api/backup/export` | GET | Export config as ZIP |
| `/api/backup/import` | POST | Import config from ZIP |
| `/api/groups` | GET | Client groups |
| `/api/users` | GET | User management |
| `/api/build` | POST | Start agent build |

## Running

```bash
cd Goylord-Server
bun run dev          # Development (with file watching)
bun run build        # Production build
bun run typecheck    # TypeScript type checking
bun test             # Run tests (463 pass, 5 fail)
```
