# Goylord — Project Structure

**Version:** 2.5.3

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
├── go.work.sum
├── LICENSE                          # Apache 2.0
├── Goylord-Client/                 # Go agent — runs on target machines
├── Goylord-Desktop/                # Tauri 2 desktop app — native operator interface
├── Goylord-Server/                 # TypeScript/Bun server — web panel + API
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

The frontend uses a custom SPA router (`soft-nav.js`) that intercepts link clicks, fetches the target page's HTML, and replaces the body content without a full page reload. Key details:

- `persistentIds` preserved across navigations: `top-nav`, `sb-mobile-bar`, `sb-backdrop`, `nav-reveal-btn`, `chat-bubble`, `chat-panel`, `cert-trust-banner`, `command-menu`, `image-modal`
- Module scripts re-execute as new instances (different `?softNav=N` URL)
- `nav.js` and `nav-prelude.js` are SKIPPED on soft-nav
- Each page has an `alive` flag mechanism to cancel stale callbacks on `pagehide`
- `navigateTo()` uses `AbortController` to cancel stale fetches
- `navSeq` counter detects stale navigations at every await point
