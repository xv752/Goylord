# Development History

**Version:** 0.0.4

## Git Overview

| Metric | Value |
|---|---|
| Total commits | ~400+ |
| Active branches | `main` (active) |
| Tags | `Goylord-Desktop-v1.0.1`, `Goylord-Desktop-v1.0.2` |
| Version range | 1.0.2 → 0.0.4 (current) |
| License | Apache 2.0 |

## Contributors

| Contributor | Commits | Notes |
|---|---|---|
| KingKDot | 610+ | Primary author (~94% of all work) |
| unknown | 11 | |
| K.Dot | 10 | Same person, different git config |
| 0XC7R | 5 | External contributor |
| ayesha-mitzcov / Ayesha Mitzcov | 5 | External contributor |
| test | 3 | Test commits |
| KingKunta | 1 | |
| Michael | 1 | |

## Version Milestones

### v1.x (Early Development)
- Initial commit: basic server + client architecture
- Remote desktop, file browser, process viewer
- HVNC support (basic)
- Webcam capture
- Basic plugin system
- Docker deployment
- Multi-platform builds (Windows, Linux, macOS, Android)

### v2.0.0 (Major Rewrite)
- New plugin system (WASM support)
- Plugin signing (Ed25519)
- RBAC (Role-Based Access Control)
- Desktop app (Tauri 2)
- WebRTC streaming
- Chat system
- Dashboard improvements

### v2.1.x
- HVNC improvements (browser cloning, context menus)
- Mobile-friendly UI
- New dashboard layout
- Clipboard sync
- WinRE persistence

### v2.2.x
- Shellcode building (Donut + SGN)
- SOCKS5 proxy
- Screenshot page + polling
- Auto-upload builds
- RBAC 3.0
- File browser 2.0
- Dead man's key
- Context menus everywhere

### v2.3.x
- Critical process protection (Windows)
- NVENC hardware encoding
- Dashboard metrics + charts
- Monaco Editor (replaced sharp)
- Gridstack dashboard
- MFA (Multi-Factor Authentication)
- Build profiles
- Offline keylogger
- Plugins 2.0 (WASM sandbox)
- Custom CSS support
- Desktop audio streaming
- Webcam quality slider (H264)
- Registry editor plugin

### v2.4.x
- OIDC + SSO support
- Custom branding (login screen)
- Auto build tags
- Encrypted logs
- Plugin badges
- NVENC + AMF + Intel oneVPL hardware encoding control
- Async Media Foundation H264 (Windows)
- Texture backend abstraction
- Purgatory (enrollment) UI improvements
- Privacy selector
- Better crash logging
- Optimized JPEG streaming
- Optimized DB read/write for large client counts

### v2.5.x (Current)
- Voice capture (winmm.dll, pure Go, no COM)
- SPA soft-navigation system (client-side router)
- Hardware filtering (CPU/GPU dropdowns, RAM min/max)
- Backup/restore (ZIP export/import)
- Permission groups
- Auto-scripts and auto-deploys
- File sharing
- Client groups
- Build profiles
- SPA-aware command menu and modals
- Console→Clients navigation fix (rAF cancellation, AbortController)
- HVNC injection memory fix (kdot contribution: `CreateEnvironmentBlock` API)
- Version sync across all components (0.0.4)

## Key Pull Requests Merged

| PR | Contributor | Description |
|---|---|---|
| #1 | 0XC7R | README formatting fix |
| #3 | EKSDEEf | UPX compression, mass command, Windows badges |
| #5 | Deusogu | Visual drag-and-drop script builder |
| #6 | EKSDEEf | Firefox HVNC profile cloning fix |
| #7 | EKSDEEf | Execution uploading fix |
| #13 | ayeshamitzcov | Desktop audio + .gitignore fix |
| #17 | 0XC7R | README update |
| #21 | Deusogu | Shellcode clean |

## Development Patterns

- **Single-author dominated**: KingKDot writes ~94% of all code
- **Linear history**: Nearly all work on `main`, one merge from `dev`
- **Rapid iteration**: Frequent small commits, often multiple per day
- **Pragmatic style**: Commit messages are casual/direct, reflecting solo development
- **AI-assisted**: Several commits credit Claude for code generation (UI, tests, TypeScript fixes)
- **Feature-driven**: Each version adds significant new capabilities
- **Security-conscious**: Regular security fixes, RBAC iterations, encrypted logs, plugin signing
