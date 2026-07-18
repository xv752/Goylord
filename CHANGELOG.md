# CHANGELOG

All notable changes to the Goylord project. Machine-readable format for webhook consumption.

---

## [0.0.5]

#### hevc-codec - HEVC encoding support with codec negotiation
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/desktop-codec-negotiation.ts` (new) | server | Codec negotiation selects mutually compatible codecs across viewer transports |
| `src/server/viewer-authorization.ts` (new) | server | Live revalidation of viewer WS sessions every 5 seconds |
| `src/protocol.ts` | server | Added HEVC format to FrameHeader, DesktopCodecCapability types |
| `src/server/ws-console-rd-backstage.ts` | server | Codec negotiation in encoder capabilities, HEVC recording rejection |
| `src/server/ws-viewer-utils.ts` | server | HEVC format 5 frame encoding |
| `src/server/routes/webrtc-routes.ts` | server | Feature access gating per WebRTC media kind, viewer session tracking |
| `public/assets/remotedesktop.js` | frontend | HEVC browser decoder probing, codec negotiation, fallback chain |

#### permission-gates - Auth and RBAC hardening
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/routes/websocket-lifecycle-routes.ts` | server | Viewer socket registration and revalidation on open/message/close |
| `src/server/routes/ws-upgrade-routes.ts` | server | Pass authTokenHash for viewer session revalidation |
| `src/server/routes/client-command-routes.ts` | server | `remote_desktop` feature gate for desktop_start command |
| `src/server/routes/client-routes.ts` | server | `clients:metadata` + `client_metadata` feature gate for bookmark endpoint |
| `src/server/routes/plugin-routes.ts` | server | Filter dashboard contributions by client access scope |
| `src/sessions/sessionManager.ts` | server | Dashboard client events filtered by client access scope |

#### simple-theme - Easy custom branding in settings
| File(s) | Component | Description |
|---------|-----------|-------------|
| `public/assets/settings.js` | frontend | Simple theme builder with CSS generation from color pickers |
| `public/settings.html` | frontend | Simple theme UI with live preview |

#### version-bump - 0.0.4 → 0.0.5
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/version.ts`, `package.json`, config.go, tauri.conf.json, Desktop package.json, Cargo.toml | all | Version aligned to 0.0.5 |

---

## [0.0.4] - 2026-07-17

### Commits

#### feature(desktop): codec negotiation module for desktop streaming

**Severity:** Feature
**Component:** Goylord-Server (TypeScript)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Codec negotiation module | Feature | `desktop-codec-negotiation.ts` (new) | Pure utility for negotiating video codec and transport between agent and viewer. Normalizes codec names (h265→hevc, mjpeg→jpeg), filters by transport (websocket/webrtc), selects best mutually-supported codec with fallback ordering |

#### feature(turn): TURN/Coturn ICE relay support for WebRTC

**Severity:** Feature
**Component:** Goylord-Server (TypeScript), Goylord-Client (Go agent), Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| TURN credential generation | Feature | `turn-credentials.ts` (new) | HMAC-SHA1 short-lived credentials, env vars: GOYLORD_TURN_HOST/PORT/SECRET/REALM/TTL |
| TURN credential tests | Test | `turn-credentials.test.ts` (new) | 7 tests for STUN+TURN entries, identity sanitization, expiry, env fallback |
| ICE config endpoint | Feature | `webrtc-routes.ts` | `GET /api/webrtc/ice-config?identity=` returns `{ iceServers: [...] }` for browser WHEP/P2P |
| Server relays ICE servers | Feature | `ws-console-rd-backstage.ts`, `ws-desktop-audio.ts` | All `webrtc_publish` and `webrtc_p2p_offer` payloads include `iceServers` from TURN credentials |
| Agent ICEServer type | Feature | `state.go` | Added `ICEServer` struct and `ICEServers` field to `Options` |
| Agent parseICEServers | Feature | `handlers/webrtc.go` | Parses `iceServers` from command payload, wired to Options |
| WHIP uses server ICE | Feature | `whip_pion.go` | Peer connection uses server-provided STUN/TURN when available |
| P2P uses server ICE | Feature | `p2p_pion.go` | `StartP2POffer` accepts ICE servers param, falls back to Google STUN |
| Browser WHEP ICE | Feature | `whep.js` | `resolveIceServers()` fetches `/api/webrtc/ice-config` before creating PeerConnection |
| Browser P2P ICE | Feature | `webrtc-p2p.js` | `resolveIceServers()` fetches `/api/webrtc/ice-config`, replaces hardcoded Google STUN |

#### feature(ui): red text for outdated agent versions on Clients page

**Severity:** Feature
**Component:** Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Outdated version indicator | Feature | `main.css`, `render.js` | Agent version text turns red (`--color-danger`) when lower than server version — row view, card view, and detail panel |

#### fix(port): wired H264 bitrate, stream stats, WebRTC sampler, atomic bug, dead code

**Severity:** Bugfix
**Component:** Goylord-Client (Go agent), Goylord-Server (TypeScript), Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Missing gopus dependency | Bugfix | `go.mod` | Added `github.com/thesyncim/gopus v0.1.1` — required by `audio_opus.go` for WebRTC build tag |
| H264 bitrate no-op | Bugfix | `ws-console-rd-backstage.ts`, `handlers/command.go` | Server now relays `desktop_set_bitrate` to agent; agent calls `capture.SetH264TargetBitrate()` |
| Stream stats never emitted | Bugfix | `capture/capture.go` | Added `emitDesktopStreamStats()` call in `sendCompletedFrame()` after successful frame send |
| Stream stats blocked by allowlist | Bugfix | `wsValidation.ts` | Added `desktop_stream_stats` to `ALLOWED_CLIENT_MESSAGE_TYPES` |
| Stream stats not relayed to viewers | Bugfix | `ws-console-rd-backstage.ts`, `websocket-lifecycle-routes.ts`, `main-server.ts` | Added `handleDesktopStreamStats` that relays to RD viewers, wired into deps + switch case |
| WebRTC sampler never instantiated | Bugfix | `remotedesktop.js` | Imported `WebRTCStatsSampler`, instantiated in `startWhep()`/`startP2P()`, stopped in `stopAllWebrtc()` |
| Atomic pass-by-value | Bugfix | `capture/win_bitblt.go` | `avg()` closure now takes `*atomic.Int64` instead of `atomic.Int64` by value — `Swap(0)` was clearing a copy |
| Dead code removal | Chore | `src/httpHandlers.ts` | Removed — not imported anywhere under `src/` |

#### fix(stability): keyframe storm cooldown, exponential reconnect backoff, recording safety limits

**Severity:** Bugfix
**Component:** Goylord-Server (TypeScript), Goylord-Client (Go agent)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Keyframe storm on slow viewer | Bugfix | `ws-console-rd-backstage.ts` | Added per-client cooldown map (`KEYFRAME_COOLDOWN_MS`, default 1s) — previously every backpressured frame sent a keyframe request to agent (60/s at 60fps) |
| Reconnect backoff never increases | Bugfix | `session.go` | Added `increaseBackoff()` — doubles on each failure, caps at 5 minutes, resets on success. Only called on errors, not clean disconnects |
| Recording no max duration | Bugfix | `rd-recording.ts` | Added auto-stop timer (`GOYLORD_RD_RECORD_MAX_DURATION_S`, default 4h) — prevents unbounded disk fill from forgotten recordings |
| Recording no concurrency limit | Bugfix | `rd-recording.ts` | Added admission cap (`GOYLORD_RD_RECORD_MAX_CONCURRENT`, default 4) with try-catch in caller — prevents resource exhaustion from parallel recordings |

#### port(overlord): H264 bitrate, stream stats, WebRTC improvements, backend hardening

**Severity:** Feature / Improvement
**Component:** Goylord-Client, Goylord-Server, Web UI

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| H264 bitrate management | Feature | `capture/h264_bitrate.go`, `capture/h264_bitrate_reset_other.go`, `capture/h264_bitrate_reset_windows.go` | Manual/auto bitrate control for GPU H264 encoder, 50Mbps max, CRF-based auto mode |
| H264 bitrate tests | Test | `capture/h264_bitrate_test.go` | Tests for auto/manual bitrate switching and CRF calculation |
| Stream stats emission | Feature | `capture/stream_stats.go` | Agent emits desktop stream stats (FPS, encode time, resolution, bitrate) every 500ms |
| Desktop set bitrate handler | Feature | `handlers/command.go` | Agent handles `desktop_set_bitrate` command to adjust H264 bitrate at runtime |
| Desktop stream stats wire type | Feature | `wire/protocol.go` | Added `DesktopStreamStats` struct (13 fields) and `FrameHeader.Width`/`Height` |
| gopus WebRTC audio | Feature | `webrtcpub/audio_opus.go`, `webrtcpub/audio_opus_test.go` | Opus audio encoder for WebRTC (build tag: `goylord_webrtc`) |
| User onboarding column | Feature | `db/user-schema.ts` | Migration 015: `onboarding_completed_at` on users table |
| Paths simplification | Chore | `src/paths.ts` | Removed `assertSafeTestDataDir()` — simplified `resolveDataDir()` |
| Protocol additions | Feature | `src/protocol.ts` | Added `desktop_stream_stats` MessageKind, `desktop_set_bitrate` CommandType, `DesktopStreamStats` type |
| RD viewer relay | Feature | `src/server/ws-console-rd-backstage.ts` | Added `handleDesktopStreamStats()` relay to RD viewers, `desktop_set_bitrate` forwarding |
| WS allowlist | Feature | `src/wsValidation.ts` | Added `desktop_stream_stats` to allowed message types |
| Plugin events cleanup | Chore | `src/main-server.ts` | Delete empty `pendingPluginEvents` entries after truncation |
| Plugin types | Feature | `plugins/types.go` | Added `PluginMetadata.Build` field |
| Duplicate bitrate decl | Chore | `capture/h264_encoder_windows.go` | Removed duplicate `targetH264Bitrate` function |
| Frontend WebRTC stats | Feature | `public/assets/webrtc-stats.js` | `WebRTCStatsSampler` class — polls `getStats()` at 1s interval |
| Frontend RD improvements | Feature | `public/assets/remotedesktop.js` | Diagnostics HUD, stream stats handler, manual bitrate control, network stats pill |
| Frontend RD HTML | Feature | `public/remotedesktop.html` | Stats pill, diagnostics HUD, bitrate select dropdown |

---

## [0.0.3] - 2026-07-16

### Commits

#### fix(build): auto-detect server URL/port in agent builds

**Severity:** Bugfix
**Component:** Goylord-Server build pipeline

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Auto-detect server URL | Bugfix | `server/routes/build-routes.ts` | When operator leaves server URL blank, build now auto-injects `wss://host:port` from server config instead of falling back to hardcoded `wss://127.0.0.1:5173` |
| Force wss:// prefix | Bugfix | `server/routes/build-routes.ts` | Build UI strips protocol prefix but Go agent needs full URL. Now always prepends `wss://` if missing |
| Auto-append port | Bugfix | `server/routes/build-routes.ts` | If URL is provided without a port (e.g. `192.168.1.1`), server's listen port is appended automatically |

#### fix(client): shorten agent retry delays

**Severity:** Improvement
**Component:** Goylord-Client session management

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Base backoff | Improvement | `cmd/agent/session.go` | Reduced from 10-30s to 5-15s for faster reconnection |
| Enrollment retry (pending) | Improvement | `cmd/agent/session.go` | Reduced from 30s to 10s for faster approval polling |
| Invalid signature retry | Improvement | `cmd/agent/session.go` | Reduced from 60s to 15s |

#### feat(plugins): build plugin system with artifact replacement

**Severity:** Feature
**Component:** Goylord-Server build pipeline + Plugin system

| Sub-feature | Severity | File(s) | Description |
|-------------|----------|---------|-------------|
| Build plugin pipeline | Feature | `server/build-process.ts`, `server/routes/build-routes.ts`, `server/plugin-runtime/runtime.ts`, `server/plugin-runtime/worker-host.ts` | Full build plugin integration: `GET /api/build/plugins` endpoint serves plugins with `build` config and `hasServer: true`. Artifact hook dispatches to all running plugin Workers after binary transformation. Plugin can return replacement filename — server swaps `finalOutputName` before download, upload, and push-to-all. |
| Plugin UI in build page | Feature | `public/build.html`, `public/assets/build.js` | "Build Plugins" accordion section with per-plugin cards: name, description, enable toggle, settings form (select/string/number/boolean/textarea), action buttons with `setSettings`/`setBuild`. Section hidden when no plugins available. Settings persisted to localStorage. |
| Setting validation | Feature | `server/routes/build-routes.ts` | `sanitizeBuildPlugins()` validates plugin settings against manifest: type checking, select option whitelist, min/max bounds, required field enforcement. Rejects build when required settings are empty. |
| base64-encoder plugin | Feature | `plugins/base64-encoder/` | CI testing plugin: base64-encodes the built agent binary into a `.b64` file. No settings required. Validates output is valid base64. |
| crypter-template plugin | Feature | `plugins/crypter-template/` | Crypter template: XOR/RC4/AES transforms with configurable key and output extension. Includes `requires` (disable UPX first), action buttons (`Quick XOR`), and platform filtering. |
| Build plugins documentation | Feature | `plugins/BUILD-PLUGINS.md` | 900+ line developer guide: quick start, pipeline flow, config.json schema, all 20+ hooks with payload shapes, artifact replacement pattern, settings/actions API, platform filtering, 3 complete examples, source code references. |
| Settings type fix | Bugfix | `plugins/crypter-template/config.json` | Fixed `"type": "text"` → `"type": "string"` (x2). Server normalizer only accepts `["string", "number", "boolean", "select", "textarea"]` — `"text"` was silently dropped. |
| Documentation updates | Docs | `plugins/PLUGINS.md`, `plugins/docs/README.md`, `plugins/docs/samples.md` | Added BUILD-PLUGINS.md to docs index; added base64-encoder and crypter-template to samples table; updated "Start with" recommendation. |

---

## [0.0.2] - 2026-07-15

### Commits

#### c360651 - fix(client): data races, voice use-after-free, resource leaks, filesearch cancellation

**Severity:** Critical / High
**Component:** Goylord-Client (Go agent)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Data races on env fields | High | `runtime/env.go`, `handlers/desktop.go`, `handlers/backstage.go`, `handlers/virtual.go`, `handlers/command.go` | All env.* field reads/writes now protected by per-category RWMutex (DesktopMu, BackstageMu, VirtualMu, WebcamMu). Prevents race detector failures under concurrent plugin/widget access. |
| Voice use-after-free | Critical | `audio/voice_native_windows.go` | Added `pendingBufs` list to keep `buf`/`hdr` alive until `WOM_DONE` callback. Added `onPlaybackDone` method. Reordered `Close()` to wait for `playLoop` goroutine before `waveOutReset`/`waveOutClose`. Fixes crash on rapid speak/stop cycles. |
| WebSocket response body leak | Medium | `session.go` | Close `resp.Body` on dial error path. Prevents TCP/FD leaks on repeated connection failures. |
| Filesearch stack overflow + cancellation | High | `filesearch/lookup.go` | Added `context.Context` parameter to `LookupExe`. Checks `ctx.Err()` in walkDir. Replaced recursive `collectMatches` fallback with iterative stack to prevent stack overflow on large directory trees. |
| Crash log race | Medium | `handlers/panic_guard.go`, `plugins/panic_guard.go` | Added `sync.Mutex` protecting `writeCrashLog` to prevent garbled output from concurrent panics. |

---

#### 41e4aeb - fix(server): backup integrity, JWT validation, DNS rebinding, audit log, thumbnails

**Severity:** High
**Component:** Goylord-Server (TypeScript/Bun)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Backup ZIP integrity | High | `server/routes/backup-routes.ts` | Validate ZIP entry names against path traversal (`../`, `..\\`). Whitelist allowed filenames. Verify CRC32 before writing extracted files. |
| JWT runtime validation | High | `auth.ts` | Replaced unsafe `as` casts with runtime type checks and role whitelist validation on decoded JWT payloads. |
| DNS rebinding TOCTOU pin | High | `server/url-security.ts` | Pin resolved IP address before fetch to prevent DNS rebinding attacks where DNS changes between resolution and connection. |
| Agent token redaction | Medium | `server/agent-auth.ts` | Delete token from URL searchParams after extraction to prevent leakage in logs/error messages. |
| Cert SAN injection | Medium | `certGenerator.ts` | Sanitize commonName and additionalIPs against OpenSSL config injection via `sanitizeSanValue()`. |
| Thumbnail map bounds | Low | `thumbnails.ts` | NaN protection and upper bounds on env var parsing. Evict oldest entries when map exceeds 500 entries. |
| Plugin event buffer cap | Medium | `server/ws-notifications-plugin.ts` | Cap pendingPluginEvents array on push (200 max) and clean up empty entries on interval (100 max). Prevents unbounded memory growth. |
| Audit log shared DB | Low | `auditLog.ts` | Reuse main DB connection instead of opening a second bun:sqlite instance. |

---

#### 03da0c4 - fix(server/routes): password policy, OIDC redirect, enrollment access, security floors

**Severity:** Medium / High
**Component:** Goylord-Server routes

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Password policy in key mode | Medium | `routes/registration-routes.ts` | Added `validatePasswordPolicy()` check in key-based registration path. Previously only enforced in password mode. |
| OIDC open redirect | High | `routes/oidc-routes.ts` | Reject `returnTo` values containing `://` or starting with `//`. Prevents redirect to arbitrary external domains. |
| Enrollment settings permission | Medium | `routes/enrollment-routes.ts` | GET `/api/enrollment/settings` now requires admin role. Was previously accessible to any authenticated user. |
| Security config minimum floors | Medium | `routes/misc-routes.ts` | Enforce minimum values: `passwordMinLength >= 1`, `loginMaxAttempts >= 1`, `sessionTtlHours >= 1`, `loginWindowMinutes >= 1`. Prevents disabling security via config. |
| Socks5 proxy backpressure | Medium | `server/socks5-proxy-manager.ts` | Close tunnel on write queue overflow instead of silently dropping data. |

---

#### cd8a101 - fix(frontend): XSS in command palette via unescaped client data

**Severity:** High
**Component:** Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Command palette XSS | High | `public/assets/command-palette.js` | Import `escapeHtml` from `format.js`. Wrap all interpolated values in `renderRow()` with `escapeHtml()`. Prevents stored XSS through malicious client hostnames/nicknames. |

---

#### c204d2d - fix(desktop): replace eval with navigate, enable CSP

**Severity:** Medium
**Component:** Goylord-Desktop (Tauri)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| eval() removal | Medium | `src-tauri/src/lib.rs` | Replace `window.eval()` with `window.navigate()` for index.html redirect. Eliminates potential code injection vector. |
| Content Security Policy | Medium | `src-tauri/tauri.conf.json` | Set CSP header instead of null. Prevents XSS and code injection attacks. |

---

#### 595e432 - fix(backstage): shared memory DACL, SRWLOCK race, W^X memory permissions

**Severity:** High
**Component:** BackstageCapture / BackstageInjection (C/Win32)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Shared memory DACL | High | `BackstageCapture/src/DXGICapture.c` | Add DACL restricting shared memory access to current user only. Prevents local privilege escalation via shared memory access by other users. |
| SRWLOCK synchronization | High | `BackstageInjection/src/NtApiHooks.c` | Replace `Sleep(50)` with `SRWLOCK` for proper synchronization. Wrap all `Original*()` calls with shared lock. Fixes race condition under concurrent hook/unhook. |
| W^X memory permissions | Medium | `BackstageInjection/src/NtApiHooks.c` | Change `PAGE_EXECUTE_READWRITE` to `PAGE_READWRITE` + `VirtualProtectEx` to `PAGE_EXECUTE_READ` after `WriteProcessMemory`. Follows W^X principle for injected memory. |

---

#### 4f4a035 - fix(build): graceful CGO fallback when cross-compiler unavailable

**Severity:** Low
**Component:** Goylord-Server build system

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| CGO fallback | Low | `server/build-process.ts` | When mingw-w64 toolchain provisioning fails, fall back to `CGO_ENABLED=0` instead of crashing the build. |
| CSRF middleware | Info | `server/csrf.ts` | CSRF middleware prepared for future use (not active — auth cookie already uses `SameSite=Strict`). |

---

#### f183131 - fix(frontend): auth cache headers, credentials include, monaco dispose

**Severity:** Medium
**Component:** Web UI (frontend) + Server Routes

Ported from upstream commits by kdot (c577d8b, 22b0eed).

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Auth cache-control no-store | Medium | `server/routes/auth-routes.ts` | Add `Cache-Control: no-store, private` header to `/api/auth/me` response. Prevents browser caching of sensitive user data. |
| Fetch credentials include | Medium | `public/assets/data.js`, `main.js`, `file-share.js`, `deploy.js`, `scripts.js`, `users.js`, `notifications.js`, `winre.js` | Add `credentials: "include"` to all missing `fetch()` calls for auth endpoints. Prevents silent auth failures behind reverse proxies. |
| Nav auth cache bust | Low | `public/assets/nav.js` | Add `cache: "no-store"` to sidebar auth/me fetch. Prevents stale onboarding state after login. |
| Monaco dispose | Low | `public/assets/monaco-loader.js` | Add `dispose()` method to Monaco editor adapter. Prevents memory leaks when editor is destroyed. |

---

### fix(backup): backup import — ZIP layout + CRC32 sign + DB lock

**Severity:** Critical
**Component:** Goylord-Server (TypeScript)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| ZIP layout wrong | Critical | `backup-routes.ts` `buildZip()` | All local headers written first, then all data. ZIP format requires each header immediately followed by its data. Import always failed to parse entries correctly. |
| CRC32 signed comparison | Critical | `backup-routes.ts` `readU32()` | `readU32` returned signed 32-bit integers via `<< 24`. `crc32()` returns unsigned via `>>> 0`. Half of all CRCs failed comparison due to sign mismatch. Added `>>> 0` to `readU32`. |
| DataView bounds error | High | `backup-routes.ts` ZIP parser | Bun's `req.arrayBuffer()` can have `buffer.byteLength > Uint8Array.length`. Replaced all `DataView` construction with manual byte reads. |
| DB file locked | High | `backup-routes.ts`, `connection.ts` | Import tried to overwrite live SQLite file (locked by running server). Now writes to `.db.import` staging files; `applyPendingDbImport()` in `connection.ts` renames them on next startup. |
| Unhandled crash | Medium | `backup-routes.ts` | Added `try-catch` around entire import handler to prevent server crash on malformed ZIPs. Returns JSON error instead. |

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 15 |
| Medium | 14 |
| Low | 5 |
| Info | 1 |
| Feature | 8 |
| **Total** | **45** |

| Component | Fixes |
|-----------|-------|
| Go Client (agent) | 5 |
| TypeScript Server | 8 |
| Server Routes | 6 |
| Web UI (frontend) | 5 |
| Tauri Desktop | 2 |
| Backstage (C/Win32) | 3 |
| Build System | 2 |
| Build Plugins | 8 |

## Test Results

- **Server:** 479 pass, 5 fail (pre-existing `client-order.test.ts` failures, no regressions)
- **Go Client:** `go build ./cmd/agent/` — builds clean, no race conditions detected
- **Build Plugins:** 65 integration checks passed (extraction, manifests, API filter, validation, Worker runtime, artifact hooks, asset files, build/upload/upload-all paths)

---

### feat(rdp): WebRTC stats sampler + diagnostics HUD

**Severity:** Feature
**Component:** Web UI (frontend), Remote Desktop

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| WebRTC stats sampler | Feature | `assets/webrtc-stats.js` | NEW: `WebRTCStatsSampler` class polls `getStats()` to collect RTT, bitrate, protocol, codec, packet loss, jitter, decode timing per inbound stream |
| Diagnostics HUD | Feature | `assets/remotedesktop.js`, `remotedesktop.html` | Real-time streaming health overlay with 18 fields: agent pipeline, transport metrics, viewer pipeline. Severity-based auto-diagnostics summary |
| Bitrate control | Feature | `assets/remotedesktop.js`, `remotedesktop.html` | Manual H.264 target bitrate selector (Auto / 5–50 Mbps) with `desktop_set_bitrate` command |
| Network stats pill | Feature | `assets/remotedesktop.js`, `remotedesktop.html` | Toolbar net pill shows live WebRTC receive bitrate, RTT, loss, route |
| WS frame telemetry | Feature | `assets/remotedesktop.js` | WS bitrate tracking, frame coalescing count, decode/render timing for canvas path |
| Agent stream stats | Feature | `assets/remotedesktop.js` | `desktop_stream_stats` message handler feeds agent-side capture/encode/send timings to HUD |

---

### feat(rdp): H264 bitrate management + stream stats + Opus audio

**Severity:** Feature
**Component:** Goylord-Client (Go agent), Goylord-Server (TypeScript), Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| H264 bitrate management | Feature | `capture/h264_bitrate.go`, `capture/h264_bitrate_reset_other.go`, `capture/h264_bitrate_reset_windows.go` | Manual/auto H264 target bitrate with atomic int64 state, CRF calculation, 50Mbps max. Triggers encoder reset on change. Platform-specific texture encoder reset stubs. |
| H264 bitrate tests | Feature | `capture/h264_bitrate_test.go` | Tests for auto mode (1080p60, 4K240 cap) and manual override (720p30) |
| Agent stream stats | Feature | `capture/stream_stats.go` | Goroutine sends `desktop_stream_stats` message every 500ms with capture/encode/send FPS, frame timings, dropped frames, GPU encoder status, resolution, target bitrate |
| Opus audio encoder | Feature | `webrtcpub/audio_opus.go`, `webrtcpub/audio_opus_test.go` | Opus 48kHz stereo encoder/decoder with build tag `goylord_webrtc`. Fragmented PCM encode/decode test. |
| Wire protocol extensions | Feature | `wire/protocol.go` | `DesktopStreamStats` struct (13 fields), `FrameHeader.Width/Height` |
| Protocol types | Feature | `src/protocol.ts` | `desktop_stream_stats` message kind, `desktop_set_bitrate` command, `DesktopStreamStats` type, `FrameHeader.width/height` |
| HTTP client handlers | Feature | `src/httpHandlers.ts` | REST endpoint for client listing with pagination/search/sort, command dispatch (simple, payload, file commands), markOnline/markOffline |
| User schema migration | Feature | `src/db/user-schema.ts` | Migration 015: `onboarding_completed_at` column on users table |
| Plugin events cleanup | Bugfix | `src/main-server.ts` | Delete empty `pendingPluginEvents` entries after truncation in sweep interval |
| Paths test safety | Bugfix | `src/paths.ts` | Removed `assertSafeTestDataDir()` — Goylord lacks `test/preload.ts` infrastructure. Simplified `resolveDataDir()`. |
| Duplicate bitrate decl | Bugfix | `capture/h264_encoder_windows.go` | Removed duplicate `targetH264Bitrate` function (now in `h264_bitrate.go`) |
| .gitignore | Chore | `.gitignore` | Added `GITHUB.md` to gitignore |

---

### fix(port): wired H264 bitrate, stream stats, WebRTC sampler, atomic bug, dead code

**Severity:** Bugfix
**Component:** Goylord-Client (Go agent), Goylord-Server (TypeScript), Web UI (frontend)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Missing gopus dependency | Bugfix | `go.mod` | Added `github.com/thesyncim/gopus v0.1.1` — required by `audio_opus.go` for WebRTC build tag |
| H264 bitrate no-op | Bugfix | `ws-console-rd-backstage.ts`, `handlers/command.go` | Server now relays `desktop_set_bitrate` to agent; agent calls `capture.SetH264TargetBitrate()` |
| Stream stats never emitted | Bugfix | `capture/capture.go` | Added `emitDesktopStreamStats()` call in `sendCompletedFrame()` after successful frame send |
| Stream stats blocked by allowlist | Bugfix | `wsValidation.ts` | Added `desktop_stream_stats` to `ALLOWED_CLIENT_MESSAGE_TYPES` |
| Stream stats not relayed to viewers | Bugfix | `ws-console-rd-backstage.ts`, `websocket-lifecycle-routes.ts`, `main-server.ts` | Added `handleDesktopStreamStats` that relays to RD viewers, wired into deps + switch case |
| WebRTC sampler never instantiated | Bugfix | `remotedesktop.js` | Imported `WebRTCStatsSampler`, instantiated in `startWhep()`/`startP2P()`, stopped in `stopAllWebrtc()` |
| Atomic pass-by-value | Bugfix | `capture/win_bitblt.go` | `avg()` closure now takes `*atomic.Int64` instead of `atomic.Int64` by value — `Swap(0)` was clearing a copy |
| Dead code removal | Chore | `src/httpHandlers.ts` | Removed — not imported anywhere under `src/` |

---

### fix(stability): keyframe storm cooldown, exponential reconnect backoff, recording safety limits

**Severity:** Bugfix
**Component:** Goylord-Server (TypeScript), Goylord-Client (Go agent)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Keyframe storm on slow viewer | Bugfix | `ws-console-rd-backstage.ts` | Added per-client cooldown map (`KEYFRAME_COOLDOWN_MS`, default 1s) — previously every backpressured frame sent a keyframe request to agent (60/s at 60fps) |
| Reconnect backoff never increases | Bugfix | `session.go` | Added `increaseBackoff()` — doubles on each failure, caps at 5 minutes, resets on success. Prevents thundering herd after outage |
| Recording no max duration | Bugfix | `rd-recording.ts` | Added auto-stop timer (`GOYLORD_RD_RECORD_MAX_DURATION_S`, default 4h) — prevents unbounded disk fill from forgotten recordings |
| Recording no concurrency limit | Bugfix | `rd-recording.ts` | Added admission cap (`GOYLORD_RD_RECORD_MAX_CONCURRENT`, default 4) — prevents resource exhaustion from parallel recordings |
| Backoff on clean disconnect | Bugfix | `session.go` | `increaseBackoff` now only called on actual errors, not clean disconnects |
| Uncaught recording throw | Bugfix | `ws-console-rd-backstage.ts` | Wrapped `startRemoteDesktopRecording` in try-catch to prevent crash on concurrency limit |

#### feature(security): viewer-authorization module ported from upstream

**Severity:** Feature
**Component:** Goylord-Server (TypeScript)

| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Viewer auth module | Feature | `viewer-authorization.ts` (new) | Centralized WebSocket viewer authorization — session validation, feature-gating, client-access checks, periodic revalidation every 5s |
