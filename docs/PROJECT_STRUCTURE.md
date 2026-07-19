# Goylord — Project Structure

**Version:** 0.0.5

## Tree Map

```
Goylord/
├── .dockerignore                    # Docker context exclusions
├── .env.example                     # All configurable environment variables
├── .gitattributes
├── .github/
│   ├── renovate.json                # Automated dependency updates (Renovate bot)
│   └── workflows/
│       ├── docker-publish.yml       # Manual: build DLLs + multi-arch Docker image → GHCR
│       ├── desktop-release.yml      # Auto: build Tauri desktop app on push to main
│       └── tests.yml               # PR/push: run server (Bun) + client (Go) tests
├── .gitignore
├── .vscode/
│   └── settings.json
├── AGENTS.md                        # AI agent working rules and constraints
├── BackstageCapture/                # Windows DLL — DXGI frame capture for HVNC
├── BackstageInjection/              # Windows DLL — NT API hooks for HVNC file redirection
├── Changes.md                       # Full changelog with timestamps
├── README.md                        # Setup guide: Docker, no-Docker, features
├── docker/
│   └── agent-builder.Dockerfile     # Dedicated agent build container
├── docker-compose.yml               # Linux: host networking, server + mediamtx
├── docker-compose.windows.yml       # Windows/macOS: bridge networking with port maps
├── docker-compose.quickstart.yml    # Minimal: server only
├── Dockerfile                       # Multi-stage: builder (Go, garble, Donut, SGN) + runtime (Bun)
├── go.work                          # Go workspace: links client + sample-go plugin
├── LICENSE                          # Apache 2.0
├── Goylord-Client/                 # Go agent — runs on target machines
│   └── cmd/agent/
│       ├── capture/                 # Screen capture + H264 bitrate management, stream stats
│       ├── webrtcpub/               # WebRTC publishing (Opus audio, Pion P2P, TURN ICE)
│       └── wire/                    # Binary protocol (msgpack, DesktopStreamStats)
├── Goylord-Desktop/                # Tauri 2 desktop app — native operator interface
├── Goylord-Server/                 # TypeScript/Bun server — web panel + API
│   ├── frontend/                   # Vue 3 SPA (Vite + TypeScript + Pinia + Tailwind)
│   │   ├── src/
│   │   │   ├── main.ts             # App entry
│   │   │   ├── App.vue             # Root component
│   │   │   ├── router/index.ts     # Vue Router (auth guards, role-based access)
│   │   │   ├── stores/             # Pinia stores (auth, ui)
│   │   │   ├── api/                # Typed API layer (client.ts, types.ts)
│   │   │   ├── composables/        # Reusable logic (useWebSocket, useMsgpack)
│   │   │   ├── components/         # Layout (AppLayout, Sidebar) + UI (Toast, Modal)
│   │   │   ├── views/              # 27 page components (Dashboard, Console, RD, etc.)
│   │   │   └── lib/                # Utilities (format.ts, constants.ts)
│   │   ├── vite.config.ts          # Vite config (base /app/, proxy, build)
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── src/
│   │   ├── paths.ts                 # Simplified path resolution
│   │   ├── db/user-schema.ts        # User DB migrations (incl. 015: onboarding_completed_at)
│   │   └── server/
│   │       ├── viewer-authorization.ts     # Per-viewer session validation and access control
│   │       ├── desktop-codec-negotiation.ts  # HEVC codec negotiation and browser decoder probing
│   │       └── turn-credentials.ts        # TURN credential generation for WebRTC
│   └── public/
│       ├── remotedesktop.html       # Remote desktop page
│       └── assets/
│           ├── remotedesktop.js     # Diagnostics HUD, stream stats, bitrate control
│           └── webrtc-stats.js      # WebRTCStatsSampler class
├── plugins/                         # Plugin system (WASM, native, server-side)
├── scripts/                         # Build, dev, and deployment scripts
├── stress/                          # k6 WebSocket load tests
├── test-e2e.ts                      # End-to-end test suite (59 tests)
└── docs/                            # Documentation
```

## Component Architecture

```
                    ┌───────────────────┐
                    │  Goylord-Server  │  TypeScript / Bun  (port 5173)
                    │  Web UI + REST API│
                    └────────┬──────────┘
                             │
             ┌───────────────┼───────────────┐
             │               │               │
       WebSocket         HTTP/API      WebRTC Signaling
             │               │               │
   ┌─────────┴─────────┐    │        ┌──────┴──────┐
   │  Goylord-Client  │    │        │   MediaMTX   │
   │  (Go agent)       │    │        │  (sidecar)   │
   │  Runs on targets  │    │        └─────────────┘
   └───────────────────┘    │
                             │
                   ┌─────────┴─────────┐
                   │ Goylord-Desktop  │
                   │ (Tauri native)    │
                   └───────────────────┘
                             │
                   ┌─────────┴─────────┐
                   │   Plugin System   │
                   │ WASM / Native /   │
                   │ Server-side       │
                   └───────────────────┘
```

| Connection | Protocol | Auth |
|---|---|---|
| Server ↔ Agent | WebSocket (binary msgpack) | Agent token + Ed25519 challenge-response enrollment |
| Server ↔ Desktop | System webview (loads web UI) | JWT (inherited from web login) |
| Server ↔ WebRTC | SDP/ICE relay or WHIP/WHEP via MediaMTX | JWT |
| Server ↔ Plugins | Bun worker threads / wazero WASM sandbox | Internal |

## SPA Soft-Navigation System

> **Migration in progress:** The frontend is being migrated from vanilla JS to Vue 3 (`Goylord-Server/frontend/`). During migration, both frontends coexist: old pages at `/`, Vue SPA at `/app/*`. See `Frontend_Migration.md` for full plan.

The original frontend uses a custom SPA router (`soft-nav.js`) that intercepts link clicks, fetches the target page's HTML, and replaces the body content without a full page reload. Key details:

- `persistentIds` preserved across navigations: `top-nav`, `sb-mobile-bar`, `sb-backdrop`, `nav-reveal-btn`, `chat-bubble`, `chat-panel`, `cert-trust-banner`, `command-menu`, `image-modal`
- Module scripts re-execute as new instances (different `?softNav=N` URL)
- `nav.js` and `nav-prelude.js` are SKIPPED on soft-nav
- Each page has an `alive` flag mechanism to cancel stale callbacks on `pagehide`
- `navigateTo()` uses `AbortController` to cancel stale fetches
- `navSeq` counter detects stale navigations at every await point
