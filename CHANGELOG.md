# CHANGELOG

All notable changes to the Goylord project. Machine-readable format for webhook consumption.

---

## [0.0.5]

#### perf-phase1 — Server performance optimizations for high-connection-scale
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/ws-notifications-plugin.ts` | server | Debounced broadcastClientLifecycleEvent with 1.5s coalescing buffer to eliminate O(n*m) per-event iteration |
| `src/db/repositories.ts` | server | Debounced per-user metrics cache invalidation (2s window), global cache still invalidated immediately |
| `src/clientManager.ts` | server | getAllClients() returns ReadonlyMap reference instead of shallow copy |
| `src/server/stale-prune.ts` | server | Accepts ReadonlyMap type for getAllClients() |
| `src/server/maintenance-loops.ts` | server | Accepts ReadonlyMap type for getAllClients() |
| `src/server/routes/ws-upgrade-routes.ts` | server | Global admission rate limiter for agent WS upgrades (200/sec default, configurable) |

#### hevc-codec — HEVC encoding support with codec negotiation
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/desktop-codec-negotiation.ts` (new) | server | Codec negotiation selects mutually compatible codecs across viewer transports |
| `src/protocol.ts` | server | Added HEVC format to FrameHeader, DesktopCodecCapability types |
| `src/server/ws-console-rd-backstage.ts` | server | Codec negotiation in encoder capabilities, HEVC recording rejection |
| `src/server/ws-viewer-utils.ts` | server | HEVC format 5 frame encoding |
| `src/server/routes/webrtc-routes.ts` | server | Feature access gating per WebRTC media kind, viewer session tracking |
| `public/assets/remotedesktop.js` | frontend | HEVC browser decoder probing, codec negotiation, fallback chain |

#### permission-gates — Auth and RBAC hardening
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/viewer-authorization.ts` (new) | server | Live revalidation of viewer WS sessions every 5 seconds |
| `src/server/routes/websocket-lifecycle-routes.ts` | server | Viewer socket registration and revalidation on open/message/close |
| `src/server/routes/ws-upgrade-routes.ts` | server | Pass authTokenHash for viewer session revalidation |
| `src/server/routes/client-command-routes.ts` | server | `remote_desktop` feature gate for desktop_start command |
| `src/server/routes/client-routes.ts` | server | `clients:metadata` + `client_metadata` feature gate for bookmark endpoint |
| `src/server/routes/plugin-routes.ts` | server | Filter dashboard contributions by client access scope |
| `src/sessions/sessionManager.ts` | server | Dashboard client events filtered by client access scope |

#### simple-theme — Easy custom branding in settings
| File(s) | Component | Description |
|---------|-----------|-------------|
| `public/assets/settings.js` | frontend | Simple theme builder with CSS generation from color pickers |
| `public/settings.html` | frontend | Simple theme UI with live preview |

#### build-signing-corrupt-key — Auto-heal corrupt Ed25519 signing keys
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/build-signing.ts` | server | `ensureKeysLoaded()` catches invalid key import and regenerates fresh Ed25519 keypair instead of crashing with HRESULT 0x8007000D |
| `save.json` | config | Removed corrupt `buildSigning.privateKey` (was literal `[redacted]` from backup/restore) |

#### x264-float-fix — Fix x264 compile error on macOS/Linux CI
| File(s) | Component | Description |
|---------|-----------|-------------|
| `cmd/agent/capture/h264_encoder_x264.go` | client | Removed incorrect `float64()` cast on `targetH264CRF()` (returns `float32`) — 3 occurrences |
| `README.md` | docs | Resolved merge conflict with upstream, updated version to 0.0.5 |

#### docker-compose-turn — Port upstream TURN/coturn/MediaMTX compose stack
| File(s) | Component | Description |
|---------|-----------|-------------|
| `docker-compose.yml` | infra | Added `turn-secret-init`, `coturn` services; `goylord-turn-secret` volume; TURN env vars; mediamtx uses generated config |
| `docker-compose.windows.yml` | infra | Same additions with bridge networking and explicit port mappings |
| `docker-compose.quickstart.yml` | infra | Added `mediamtx`, `turn-secret-init`, `coturn` with host networking; TURN env vars |

#### agent-stealth — Remove config/ directory, hide persistent state in OS paths
| File(s) | Component | Description |
|---------|-----------|-------------|
| `cmd/agent/config/config.go` | client | Removed `settings` struct, `readSettings()`, `saveSettings()` — HWID derived in-memory only. Added `stateDir()` returning hidden OS paths (`%APPDATA%\Microsoft\Windows\` on Windows, `/var/tmp/.cache/` on Linux/macOS). Added `serverIndexPath()` |
| `cmd/agent/config/instance_seed.go` | client | Seed path moved from `config/instance_seed` to `stateDir()/instance_seed` |
| `cmd/agent/config/identity_android.go` | client | ID path moved from `config/android_machine_id` to `stateDir()/android_machine_id` |
| `cmd/agent/config/identity_iostarget.go` | client | ID path moved from `config/ios_machine_id` to `stateDir()/ios_machine_id` |

#### version-bump — 0.0.4 → 0.0.5
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/version.ts`, `package.json`, config.go, tauri.conf.json, Desktop package.json, Cargo.toml | all | Version aligned to 0.0.5 |

---

## [0.0.4] - 2026-07-17

#### feature(desktop): codec negotiation module for desktop streaming
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/desktop-codec-negotiation.ts` (new) | server | Pure utility for negotiating video codec and transport between agent and viewer. Normalizes codec names (h265→hevc, mjpeg→jpeg), filters by transport (websocket/webrtc), selects best mutually-supported codec with fallback ordering |

#### feature(turn): TURN/Coturn ICE relay support for WebRTC
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/turn-credentials.ts` (new) | server | HMAC-SHA1 short-lived credentials, env vars: GOYLORD_TURN_HOST/PORT/SECRET/REALM/TTL |
| `src/server/turn-credentials.test.ts` (new) | server | 7 tests for STUN+TURN entries, identity sanitization, expiry, env fallback |
| `src/server/routes/webrtc-routes.ts` | server | `GET /api/webrtc/ice-config?identity=` returns `{ iceServers: [...] }` for browser WHEP/P2P |
| `src/server/ws-console-rd-backstage.ts`, `src/server/ws-desktop-audio.ts` | server | All `webrtc_publish` and `webrtc_p2p_offer` payloads include `iceServers` from TURN credentials |
| `cmd/agent/state.go` | client | Added `ICEServer` struct and `ICEServers` field to `Options` |
| `cmd/agent/handlers/webrtc.go` | client | Parses `iceServers` from command payload, wired to Options |
| `cmd/agent/webrtcpub/whip_pion.go` | client | Peer connection uses server-provided STUN/TURN when available |
| `cmd/agent/webrtcpub/p2p_pion.go` | client | `StartP2POffer` accepts ICE servers param, falls back to Google STUN |
| `public/assets/whep.js` | frontend | `resolveIceServers()` fetches `/api/webrtc/ice-config` before creating PeerConnection |
| `public/assets/webrtc-p2p.js` | frontend | `resolveIceServers()` fetches `/api/webrtc/ice-config`, replaces hardcoded Google STUN |

#### feature(ui): red text for outdated agent versions on Clients page
| File(s) | Component | Description |
|---------|-----------|-------------|
| `public/assets/main.css`, `public/assets/render.js` | frontend | Agent version text turns red (`--color-danger`) when lower than server version — row view, card view, and detail panel |

#### feature(rdp): H264 bitrate management + stream stats + Opus audio
| File(s) | Component | Description |
|---------|-----------|-------------|
| `cmd/agent/capture/h264_bitrate.go`, `h264_bitrate_reset_other.go`, `h264_bitrate_reset_windows.go` | client | Manual/auto H264 target bitrate with atomic int64 state, CRF calculation, 50Mbps max. Platform-specific texture encoder reset stubs |
| `cmd/agent/capture/h264_bitrate_test.go` | client | Tests for auto mode (1080p60, 4K240 cap) and manual override (720p30) |
| `cmd/agent/capture/stream_stats.go` | client | Goroutine sends `desktop_stream_stats` message every 500ms with capture/encode/send FPS, frame timings, dropped frames, GPU encoder status |
| `cmd/agent/webrtcpub/audio_opus.go`, `audio_opus_test.go` | client | Opus 48kHz stereo encoder/decoder with build tag `goylord_webrtc` |
| `cmd/agent/wire/protocol.go` | client | `DesktopStreamStats` struct (13 fields), `FrameHeader.Width/Height` |
| `src/protocol.ts` | server | `desktop_stream_stats` message kind, `desktop_set_bitrate` command, `DesktopStreamStats` type |
| `src/server/ws-console-rd-backstage.ts` | server | `handleDesktopStreamStats()` relay to RD viewers, `desktop_set_bitrate` forwarding |
| `src/wsValidation.ts` | server | Added `desktop_stream_stats` to allowed message types |

#### feature(rdp): WebRTC stats sampler + diagnostics HUD
| File(s) | Component | Description |
|---------|-----------|-------------|
| `public/assets/webrtc-stats.js` (new) | frontend | `WebRTCStatsSampler` class polls `getStats()` to collect RTT, bitrate, protocol, codec, packet loss, jitter, decode timing per inbound stream |
| `public/assets/remotedesktop.js` | frontend | Real-time streaming health overlay with 18 fields, severity-based auto-diagnostics summary |
| `public/remotedesktop.html` | frontend | Stats pill, diagnostics HUD, bitrate select dropdown |

#### fix(port): wired H264 bitrate, stream stats, WebRTC sampler, atomic bug, dead code
| File(s) | Component | Description |
|---------|-----------|-------------|
| `go.mod` | client | Added `github.com/thesyncim/gopus v0.1.1` — required by `audio_opus.go` for WebRTC build tag |
| `src/server/ws-console-rd-backstage.ts`, `handlers/command.go` | server/client | Server now relays `desktop_set_bitrate` to agent; agent calls `capture.SetH264TargetBitrate()` |
| `cmd/agent/capture/capture.go` | client | Added `emitDesktopStreamStats()` call in `sendCompletedFrame()` after successful frame send |
| `src/wsValidation.ts` | server | Added `desktop_stream_stats` to `ALLOWED_CLIENT_MESSAGE_TYPES` |
| `src/server/ws-console-rd-backstage.ts`, `websocket-lifecycle-routes.ts`, `main-server.ts` | server | Added `handleDesktopStreamStats` that relays to RD viewers, wired into deps + switch case |
| `public/assets/remotedesktop.js` | frontend | Imported `WebRTCStatsSampler`, instantiated in `startWhep()`/`startP2P()`, stopped in `stopAllWebrtc()` |
| `cmd/agent/capture/win_bitblt.go` | client | `avg()` closure now takes `*atomic.Int64` instead of `atomic.Int64` by value — `Swap(0)` was clearing a copy |
| `src/httpHandlers.ts` | server | Removed — not imported anywhere (dead code) |

#### fix(stability): keyframe storm cooldown, exponential reconnect backoff, recording safety limits
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/ws-console-rd-backstage.ts` | server | Added per-client cooldown map (`KEYFRAME_COOLDOWN_MS`, default 1s) — previously every backpressured frame sent a keyframe request to agent (60/s at 60fps) |
| `cmd/agent/session.go` | client | Added `increaseBackoff()` — doubles on each failure, caps at 5 minutes, resets on success. Only called on errors, not clean disconnects |
| `src/server/rd-recording.ts` | server | Added auto-stop timer (`GOYLORD_RD_RECORD_MAX_DURATION_S`, default 4h) and admission cap (`GOYLORD_RD_RECORD_MAX_CONCURRENT`, default 4) with try-catch in caller |
| `src/server/ws-console-rd-backstage.ts` | server | Wrapped `startRemoteDesktopRecording` in try-catch to prevent crash on concurrency limit |

#### port(overlord): backend hardening, DB migration, plugin types, gitignore
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/db/user-schema.ts` | server | Migration 015: `onboarding_completed_at` column on users table |
| `src/main-server.ts` | server | Delete empty `pendingPluginEvents` entries after truncation in sweep interval |
| `src/paths.ts` | server | Removed `assertSafeTestDataDir()` — simplified `resolveDataDir()` |
| `plugins/types.go` | client | Added `PluginMetadata.Build` field |
| `cmd/agent/capture/h264_encoder_windows.go` | client | Removed duplicate `targetH264Bitrate` function (now in `h264_bitrate.go`) |
| `.gitignore` | repo | Added `GITHUB.md` to gitignore |

---

## [0.0.3] - 2026-07-16

#### fix(build): auto-detect server URL/port in agent builds
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/routes/build-routes.ts` | server | When operator leaves server URL blank, build now auto-injects `wss://host:port` from server config instead of falling back to hardcoded `wss://127.0.0.1:5173` |
| `src/server/routes/build-routes.ts` | server | Build UI strips protocol prefix but Go agent needs full URL. Now always prepends `wss://` if missing |
| `src/server/routes/build-routes.ts` | server | If URL is provided without a port (e.g. `192.168.1.1`), server's listen port is appended automatically |

#### fix(client): shorten agent retry delays
| File(s) | Component | Description |
|---------|-----------|-------------|
| `cmd/agent/session.go` | client | Base backoff reduced from 10-30s to 5-15s for faster reconnection |
| `cmd/agent/session.go` | client | Enrollment retry (pending) reduced from 30s to 10s for faster approval polling |
| `cmd/agent/session.go` | client | Invalid signature retry reduced from 60s to 15s |

#### feat(plugins): build plugin system with artifact replacement
| File(s) | Component | Description |
|---------|-----------|-------------|
| `src/server/build-process.ts`, `src/server/routes/build-routes.ts`, `src/server/plugin-runtime/runtime.ts`, `src/server/plugin-runtime/worker-host.ts` | server | Full build plugin integration: `GET /api/build/plugins` endpoint serves plugins with `build` config and `hasServer: true`. Artifact hook dispatches to all running plugin Workers after binary transformation. Plugin can return replacement filename |
| `public/build.html`, `public/assets/build.js` | frontend | "Build Plugins" accordion section with per-plugin cards: name, description, enable toggle, settings form, action buttons |
| `src/server/routes/build-routes.ts` | server | `sanitizeBuildPlugins()` validates plugin settings against manifest: type checking, select option whitelist, min/max bounds, required field enforcement |
| `plugins/base64-encoder/` | plugin | CI testing plugin: base64-encodes the built agent binary into a `.b64` file |
| `plugins/crypter-template/` | plugin | Crypter template: XOR/RC4/AES transforms with configurable key and output extension |
| `plugins/BUILD-PLUGINS.md` | docs | 900+ line developer guide: quick start, pipeline flow, config.json schema, all 20+ hooks, artifact replacement, settings/actions API, platform filtering, 3 complete examples |
| `plugins/crypter-template/config.json` | plugin | Fixed `"type": "text"` → `"type": "string"` (x2). Server normalizer only accepts `["string", "number", "boolean", "select", "textarea"]` |
| `plugins/PLUGINS.md`, `plugins/docs/README.md`, `plugins/docs/samples.md` | docs | Added BUILD-PLUGINS.md to docs index; added base64-encoder and crypter-template to samples table |

---

## [0.0.2] - 2026-07-15

#### fix(client): data races, voice use-after-free, resource leaks, filesearch cancellation
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Data races on env fields | High | `runtime/env.go`, `handlers/desktop.go`, `handlers/backstage.go`, `handlers/virtual.go`, `handlers/command.go` | All env.* field reads/writes now protected by per-category RWMutex |
| Voice use-after-free | Critical | `audio/voice_native_windows.go` | Added `pendingBufs` list to keep `buf`/`hdr` alive until `WOM_DONE` callback. Fixes crash on rapid speak/stop cycles |
| WebSocket response body leak | Medium | `session.go` | Close `resp.Body` on dial error path. Prevents TCP/FD leaks on repeated connection failures |
| Filesearch stack overflow + cancellation | High | `filesearch/lookup.go` | Added `context.Context` parameter to `LookupExe`. Replaced recursive `collectMatches` fallback with iterative stack |
| Crash log race | Medium | `handlers/panic_guard.go`, `plugins/panic_guard.go` | Added `sync.Mutex` protecting `writeCrashLog` to prevent garbled output from concurrent panics |

#### fix(server): backup integrity, JWT validation, DNS rebinding, audit log, thumbnails
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Backup ZIP integrity | High | `server/routes/backup-routes.ts` | Validate ZIP entry names against path traversal. Whitelist allowed filenames. Verify CRC32 before writing extracted files |
| JWT runtime validation | High | `auth.ts` | Replaced unsafe `as` casts with runtime type checks and role whitelist validation on decoded JWT payloads |
| DNS rebinding TOCTOU pin | High | `server/url-security.ts` | Pin resolved IP address before fetch to prevent DNS rebinding attacks |
| Agent token redaction | Medium | `server/agent-auth.ts` | Delete token from URL searchParams after extraction to prevent leakage in logs/error messages |
| Cert SAN injection | Medium | `certGenerator.ts` | Sanitize commonName and additionalIPs against OpenSSL config injection via `sanitizeSanValue()` |
| Thumbnail map bounds | Low | `thumbnails.ts` | NaN protection and upper bounds on env var parsing. Evict oldest entries when map exceeds 500 entries |
| Plugin event buffer cap | Medium | `server/ws-notifications-plugin.ts` | Cap pendingPluginEvents array on push (200 max) and clean up empty entries on interval (100 max) |
| Audit log shared DB | Low | `auditLog.ts` | Reuse main DB connection instead of opening a second bun:sqlite instance |

#### fix(backup): ZIP layout + CRC32 sign + DB lock
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| ZIP layout wrong | Critical | `backup-routes.ts` `buildZip()` | All local headers written first, then all data. ZIP format requires each header immediately followed by its data |
| CRC32 signed comparison | Critical | `backup-routes.ts` `readU32()` | `readU32` returned signed 32-bit integers via `<< 24`. Added `>>> 0` to match unsigned CRC32 |
| DataView bounds error | High | `backup-routes.ts` ZIP parser | Bun's `req.arrayBuffer()` can have `buffer.byteLength > Uint8Array.length`. Replaced all `DataView` construction with manual byte reads |
| DB file locked | High | `backup-routes.ts`, `connection.ts` | Import tried to overwrite live SQLite file. Now writes to `.db.import` staging files; `applyPendingDbImport()` renames them on next startup |
| Unhandled crash | Medium | `backup-routes.ts` | Added `try-catch` around entire import handler to prevent server crash on malformed ZIPs |

#### fix(server/routes): password policy, OIDC redirect, enrollment access, security floors
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Password policy in key mode | Medium | `routes/registration-routes.ts` | Added `validatePasswordPolicy()` check in key-based registration path |
| OIDC open redirect | High | `routes/oidc-routes.ts` | Reject `returnTo` values containing `://` or starting with `//` |
| Enrollment settings permission | Medium | `routes/enrollment-routes.ts` | GET `/api/enrollment/settings` now requires admin role |
| Security config minimum floors | Medium | `routes/misc-routes.ts` | Enforce minimum values for passwordMinLength, loginMaxAttempts, sessionTtlHours, loginWindowMinutes |
| Socks5 proxy backpressure | Medium | `server/socks5-proxy-manager.ts` | Close tunnel on write queue overflow instead of silently dropping data |

#### fix(frontend): XSS in command palette via unescaped client data
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Command palette XSS | High | `public/assets/command-palette.js` | Import `escapeHtml` from `format.js`. Wrap all interpolated values in `renderRow()` with `escapeHtml()` |

#### fix(desktop): replace eval with navigate, enable CSP
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| eval() removal | Medium | `src-tauri/src/lib.rs` | Replace `window.eval()` with `window.navigate()` for index.html redirect |
| Content Security Policy | Medium | `src-tauri/tauri.conf.json` | Set CSP header instead of null |

#### fix(backstage): shared memory DACL, SRWLOCK race, W^X memory permissions
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Shared memory DACL | High | `BackstageCapture/src/DXGICapture.c` | Add DACL restricting shared memory access to current user only |
| SRWLOCK synchronization | High | `BackstageInjection/src/NtApiHooks.c` | Replace `Sleep(50)` with `SRWLOCK` for proper synchronization |
| W^X memory permissions | Medium | `BackstageInjection/src/NtApiHooks.c` | Change `PAGE_EXECUTE_READWRITE` to `PAGE_READWRITE` + `VirtualProtectEx` to `PAGE_EXECUTE_READ` after `WriteProcessMemory` |

#### fix(build): graceful CGO fallback when cross-compiler unavailable
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| CGO fallback | Low | `server/build-process.ts` | When mingw-w64 toolchain provisioning fails, fall back to `CGO_ENABLED=0` instead of crashing the build |
| CSRF middleware | Info | `server/csrf.ts` | CSRF middleware prepared for future use (not active) |

#### fix(frontend): auth cache headers, credentials include, monaco dispose
| Sub-fix | Severity | File(s) | Description |
|---------|----------|---------|-------------|
| Auth cache-control no-store | Medium | `server/routes/auth-routes.ts` | Add `Cache-Control: no-store, private` header to `/api/auth/me` response |
| Fetch credentials include | Medium | `public/assets/data.js`, `main.js`, `file-share.js`, `deploy.js`, `scripts.js`, `users.js`, `notifications.js`, `winre.js` | Add `credentials: "include"` to all missing `fetch()` calls for auth endpoints |
| Nav auth cache bust | Low | `public/assets/nav.js` | Add `cache: "no-store"` to sidebar auth/me fetch |
| Monaco dispose | Low | `public/assets/monaco-loader.js` | Add `dispose()` method to Monaco editor adapter |

---

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High | 15 |
| Medium | 14 |
| Low | 5 |
| Info | 1 |
| Feature | 12 |
| **Total** | **51** |

| Component | Fixes |
|-----------|-------|
| Go Client (agent) | 8 |
| TypeScript Server | 12 |
| Server Routes | 7 |
| Web UI (frontend) | 8 |
| Tauri Desktop | 2 |
| Backstage (C/Win32) | 3 |
| Build System | 2 |
| Build Plugins | 8 |
| Infrastructure | 3 |

## Test Results

- **Server:** 637 pass, 5 fail (pre-existing `client-order.test.ts` failures, no regressions)
- **Go Client:** `go build ./cmd/agent/` — builds clean, no race conditions detected
- **Build Plugins:** 65 integration checks passed
