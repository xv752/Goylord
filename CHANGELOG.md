# CHANGELOG

All notable changes to the Goylord project. Machine-readable format for webhook consumption.

---

## [0.0.5]

#### critical-fixes-rat-ui — RD input fix, backstage latency tracking, compact RAT-style UI overhaul

| File(s) | Component | Description |
|---------|-----------|-------------|
| `public/remotedesktop.html` | frontend | Add `checked` to mouseCtrl/kbdCtrl checkboxes (input was completely broken); add `max-width: 14ch` + `overflow: hidden; text-overflow: ellipsis` to NET stat chip; change latency display from `"-- ms"` to `"--ms"` |
| `public/backstage.html` | frontend | Change latency display from `"-- ms"` to `"--ms"` |
| `public/assets/remotedesktop.js` | frontend | Compact `updateNetworkStats()` format (`"1.2M"` not `"1.2 Mbps"`, `"OK"` not `"Connected"`); change `updateLatency()` to `"Xms"` format (no space) |
| `public/assets/backstage.js` | frontend | Add `input_latency` message handler; `sendCmd()` returns boolean; add `flashLaunchStatus()` for shell command feedback |
| `public/assets/main.css` | frontend | RAT-style UI overhaul: neutralize color palette (no blue tint), flatten all gradients, remove all backdrop-blur, reduce border-radius to 0-3px, reduce padding by ~50%, remove hover lifts, kill decorative animations, remove text-shadow glows, flatten scrollbar |
| `src/server/ws-console-rd-backstage.ts` | server | Add `backstageInputPending` map, `recordBackstageInput()`, `notifyBackstageInputLatency()`; backstage input commands now track latency with commandId |
| `src/server/routes/websocket-lifecycle-routes.ts` | server | Add `notifyBackstageInputLatency` to deps interface and agent message dispatch |
| `src/main-server.ts` | server | Import `notifyBackstageInputLatency` from ws-console-rd-backstage |

#### frontend-ux-polish — Stats HUD layout fix, modal bug fix, CSS cleanup, custom.css 404 fix

| File(s) | Component | Description |
|---------|-----------|-------------|
| `Goylord-Server/public/remotedesktop.html` | frontend | Replaced inline FPS/latency/network stat boxes with fixed-width `.rd-stat-chip` elements using `tabular-nums`, `min-width`, and `flex-nowrap` to prevent layout reflow when values change |
| `Goylord-Server/public/backstage.html` | frontend | Split combined FPS/latency pill into separate `.rd-stat-chip` elements matching RD style; added matching CSS with violet-tinted stat colors |
| `Goylord-Server/public/assets/ui.js` | frontend | Fixed modal open/close using `"hidden"` class instead of `"Virtual"` (find-and-replace error) |
| `Goylord-Server/public/assets/custom.css` | frontend | Created minimal file to eliminate 404 on all 29 HTML pages that reference it |
| `Goylord-Server/public/assets/main.css` | frontend | Simplified `cardFlipFall` 3D uninstall animation → `cardFadeOut` fade; removed `crownBounce` animation from `.header-crown`; simplified `radioactiveShakeIntense` (2px→1px); removed `login-btn-particle` elaborate styles; changed `.login-btn:hover` from `translateY(-1px)` to `filter: brightness(1.08)`; removed `translateY(-1px)` from generic button hover |
| `Goylord-Server/public/assets/backstage.js` | frontend | Fixed `updateFpsDisplay` — removed references to non-existent `diagnostics` object; now uses `Math.round(Number(agentValue) || 0)` directly |

#### vue3-migration-phase0 — Vue 3 frontend scaffolding + File Share view
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/` (21 new files) | frontend | Vue 3 + Vite + TypeScript + Pinia + Vue Router + Tailwind CSS v4 scaffold with full project structure |
| `frontend/src/views/FileShareView.vue` | frontend | Complete Vue port of file share page (upload, list, edit, delete, copy link) |
| `frontend/src/composables/useWebSocket.ts` | frontend | Unified WebSocket composable with auto-reconnect, binary msgpack decode |
| `frontend/src/api/client.ts` | frontend | Typed API layer for auth, file share, and client endpoints |
| `frontend/src/stores/auth.ts` | frontend | Pinia auth store with login/logout/fetchUser, role-based computed properties |
| `frontend/src/components/layout/Sidebar.vue` | frontend | Role-based nav sidebar with group headers and logout |
| `src/server/routes/page-routes.ts` | server | Added `/app/*` catch-all to serve Vue SPA `index.html` for incremental migration |
| `package.json` | server | Added `dev:frontend`, `build:frontend`, `preview:frontend`, `typecheck:frontend` scripts |

#### vue3-phase1 — Full view implementations + File Share removed
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/DashboardView.vue` | frontend | Full client dashboard: search, filters, 7 sort modes, 3 layouts (cards/rows/table), pagination, WS live updates, action buttons |
| `frontend/src/views/ConsoleView.vue` | frontend | xterm-style terminal with WS connection skeleton |
| `frontend/src/views/RemoteDesktopView.vue` | frontend | JPEG frame canvas rendering, mouse input, FPS/latency HUD |
| `frontend/src/views/BackstageView.vue` | frontend | HVNC viewer skeleton with WS |
| `frontend/src/views/FileBrowserView.vue` | frontend | Breadcrumb nav, file table, directory navigation |
| `frontend/src/views/ProcessesView.vue` | frontend | Process table with search, kill, memory formatting |
| `frontend/src/views/KeyloggerView.vue` | frontend | Window list + keystroke log with search |
| `frontend/src/views/WebcamView.vue` | frontend | Video canvas with resolution selector |
| `frontend/src/views/VoiceView.vue` | frontend | Audio visualization skeleton |
| `frontend/src/views/BuildView.vue` | frontend | Build form + plugin cards + streaming output console |
| `frontend/src/views/SettingsView.vue` | frontend | 6-tab settings (General, Security, TLS, OIDC, Appearance, Registration) |
| `frontend/src/views/UsersView.vue` | frontend | User table, create form, role toggle, delete |
| `frontend/src/views/ScriptsView.vue` | frontend | Sidebar script list, code editor, client exec |
| `frontend/src/views/MetricsView.vue` | frontend | Stat cards, bar chart, server info |
| `frontend/src/views/GraphView.vue` | frontend | SVG-based graph with node details panel |
| `frontend/src/views/ScreenshotsView.vue` | frontend | Thumbnail grid, lightbox expand, pagination |
| `frontend/src/views/NotificationsView.vue` | frontend | Notification list with read/unread, type filter |
| `frontend/src/views/PurgatoryView.vue` | frontend | Pending agents with approve/reject/approve all |
| `frontend/src/views/DeployView.vue` | frontend | File upload, client selection, deploy execution |
| `frontend/src/views/PluginsView.vue` | frontend | Plugin list with toggle switches, install/uninstall |
| `frontend/src/views/LogsView.vue` | frontend | Audit log table with search, date range, pagination |
| `frontend/src/views/Socks5View.vue` | frontend | Proxy table, add modal, auto-refresh, stop |
| `frontend/src/views/SolPublishView.vue` | frontend | Server URL + RPC endpoint form |
| `frontend/src/views/WinREView.vue` | frontend | Client checkboxes, install/uninstall, file upload |
| `frontend/src/views/UserClientAccessView.vue` | frontend | User selector, scope radio, rule list add/remove |
| `frontend/src/views/ChangePasswordView.vue` | frontend | Standalone password change form |
| `frontend/src/views/FileShareView.vue` | frontend | **DELETED** — removed per user request |
| `frontend/src/lib/constants.ts` | frontend | Removed FileShare nav item, made CLIENT_PAGE_MAP requires optional |
| `frontend/src/api/client.ts` | frontend | Full typed API layer for all endpoints |
| `frontend/src/api/types.ts` | frontend | Full TypeScript interfaces for all data models |
| `frontend/src/router/index.ts` | frontend | All routes with auth guards and client sub-pages |

#### vue3-full-implementation — Complete frontend rewrite with real API/WS integration
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/lib/api.ts` (new) | frontend | Generic fetch wrapper (api.get/post/patch/put/delete) for simpler views |
| `frontend/src/api/types.ts` | frontend | Complete types: all API models, WS message types, file browser, enrollment, SOCKS5 |
| `frontend/src/api/client.ts` | frontend | Typed fetch wrappers for ALL server endpoints |
| `frontend/src/stores/auth.ts` | frontend | Result-driven login ({ok, error}), fetchUser, logout, role computeds |
| `frontend/src/stores/ui.ts` | frontend | Typed toast notification system |
| `frontend/src/lib/format.ts` | frontend | formatBytes, formatDate (auto ms/s), timeAgo, escapeHtml, formatMs |
| `frontend/src/lib/constants.ts` | frontend | NAV_GROUPS with access control, CLIENT_PAGE_MAP |
| `frontend/src/composables/useWebSocket.ts` | frontend | WS composable with JSON/binary handling, FRM detection, auto-reconnect |
| `frontend/src/views/LoginView.vue` | frontend | Centered form, error display, loading, result-driven routing |
| `frontend/src/views/DashboardView.vue` | frontend | useWebSocket, 6 filters, 3 layouts, 8 actions, pagination, real-time WS |
| `frontend/src/views/ConsoleView.vue` | frontend | Terminal: console_start/input/resize, keyboard capture, ResizeObserver, 80KB scrollback |
| `frontend/src/views/RemoteDesktopView.vue` | frontend | FRM binary frames (JPEG), canvas rendering, mouse/keyboard, quality selector |
| `frontend/src/views/BackstageView.vue` | frontend | Same as RD with backstage_ prefixed commands |
| `frontend/src/views/FileBrowserView.vue` | frontend | Folder tree, breadcrumb, file table, download, mkdir, delete, inline rename |
| `frontend/src/views/ProcessesView.vue` | frontend | Sortable columns, CPU/memory color coding, search, kill, auto-refresh |
| `frontend/src/views/KeyloggerView.vue` | frontend | Log file list, keystroke content, timestamp parsing, search, auto-scroll |
| `frontend/src/views/WebcamView.vue` | frontend | Device selector, canvas video, FPS counter, start/stop |
| `frontend/src/views/VoiceView.vue` | frontend | Web Audio API frequency visualization, volume meter, source selector |
| `frontend/src/views/BuildView.vue` | frontend | Platform/arch form, plugin settings, build output console, history, polling |
| `frontend/src/views/SettingsView.vue` | frontend | 5-tab (General/Security/TLS/Appearance/Chat), per-tab PATCH, toggles, toasts |
| `frontend/src/views/UsersView.vue` | frontend | User CRUD table, role/permission editing |
| `frontend/src/views/ScriptsView.vue` | frontend | Script list + editor pane + execute modal |
| `frontend/src/views/MetricsView.vue` | frontend | Stat cards, online rate bar, OS groups, client table |
| `frontend/src/views/GraphView.vue` | frontend | Group cards with bar visualization, client grid |
| `frontend/src/views/ScreenshotsView.vue` | frontend | Thumbnail grid, lightbox overlay, pagination |
| `frontend/src/views/NotificationsView.vue` | frontend | Notification list with WebSocket live feed |
| `frontend/src/views/PurgatoryView.vue` | frontend | Pending agents table, approve/deny, auto-refresh |
| `frontend/src/views/DeployView.vue` | frontend | Drag-drop upload, client selector, progress bar |
| `frontend/src/views/PluginsView.vue` | frontend | Plugin list with toggle switches, upload/delete |
| `frontend/src/views/LogsView.vue` | frontend | Audit log table with search, pagination, auto-refresh |
| `frontend/src/views/Socks5View.vue` | frontend | Active proxies, create modal, 5s auto-refresh |
| `frontend/src/views/SolPublishView.vue` | frontend | Simple URL input + publish form |
| `frontend/src/views/WinREView.vue` | frontend | Client checkboxes, file upload, install/uninstall |
| `frontend/src/views/UserClientAccessView.vue` | frontend | User selector, scope radios, allowlist/denylist rules |
| `frontend/src/views/ChangePasswordView.vue` | frontend | Standalone form with redirect on success |

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

#### vue3-redesign-dark-rat-panel — Match old UI glassmorphism dark panel aesthetic
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/assets/styles/main.css` | frontend | Complete design system rewrite: `@theme` overrides entire Tailwind slate palette to match old UI colors (`#04070d` bg, `#0a0d14` body, `#0f172a` surfaces). Global component classes: `.btn`, `.btn-primary`, `.btn-danger`, `.input`, `.panel`, `.card`, `.data-table`, `.badge`, `.status-dot`, `.toast`, `.ctx-menu`, `.alert`, `.toggle` |
| `frontend/src/components/layout/Sidebar.vue` | frontend | 224px glass sidebar: `rgba(2,8,22,0.97)` bg, 9px radius links, indigo active state, collapse to 64px, gradient logo, user avatar |
| `frontend/src/components/layout/AppLayout.vue` | frontend | Glassmorphism topbar with `backdrop-filter: blur(8px)` |
| `frontend/src/views/LoginView.vue` | frontend | Glassmorphism login card with gradient background, indigo gradient button |
| `frontend/src/views/DashboardView.vue` | frontend | Client rows/cards with left group-color strip, status pulse dot, ping color coding, glass context menu |
| `frontend/src/views/UsersView.vue` | frontend | Refactored to global component classes |
| `frontend/src/views/LogsView.vue` | frontend | Refactored to global component classes |
| `frontend/src/views/NotificationsView.vue` | frontend | Refactored to global component classes |
| `frontend/src/views/PurgatoryView.vue` | frontend | Refactored to global component classes |
| `frontend/src/views/SettingsView.vue` | frontend | Tab nav with indigo indicator, glass sections, toggle component |
| `frontend/src/components/ui/Toast.vue` | frontend | Glassmorphism toast with icon badges |

## Test Results

- **Server:** 637 pass, 5 fail (pre-existing `client-order.test.ts` failures, no regressions)
- **Vue Frontend:** 9/9 API+SPA tests pass, build succeeds (162KB JS, 73KB CSS, 104 modules)
- **Go Client:** `go build ./cmd/agent/` — builds clean, no race conditions detected
- **Build Plugins:** 65 integration checks passed

#### vue3-api-endpoint-fix — Comprehensive API endpoint audit & fix across all Vue views
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/SettingsView.vue` | frontend | Fixed 7 endpoints: MFA routes (`/api/mfa/*` not `/api/auth/mfa/*`), password (`/api/users/:id/password`), TLS (`/api/settings/tls`), security/OIDC/appearance/chat field mapping, enrollment settings (`POST` not `PUT`), build limits (`/api/settings/build-rate-limit`) |
| `frontend/src/views/UsersView.vue` | frontend | Fixed 4 endpoints: removed non-existent `PUT /api/users/:id`, use granular `/role` + `/password`, split permissions into `/permission-groups` + `/feature-permissions`, fixed group update to `PATCH` |
| `frontend/src/views/PluginsView.vue` | frontend | Fixed 4 bugs: unwrap `{ plugins }` response, remove non-existent `/disable` (use `/enable` with body), add missing `{ enabled }` and `{ autoLoad }` bodies |
| `frontend/src/views/ScriptsView.vue` | frontend | Fixed 2 bugs: wrong body key `command` → `action`, empty content rejected by server |
| `frontend/src/views/Socks5View.vue` | frontend | Fixed 1 bug: proxy start success message showed undefined port |
| `frontend/src/views/LogsView.vue` | frontend | Fixed 1 bug: date filtering sent ISO strings but server expects epoch milliseconds |
| `frontend/src/views/PurgatoryView.vue` | frontend | Fixed 1 bug: "Unless Suspicious" toggle also toggled `requireApproval` |
| `src/server/routes/enrollment-routes.ts` | server | Fixed route shadowing: `DELETE /api/enrollment/banned-ips` unreachable due to generic `DELETE /api/enrollment/:id` regex matching first |

| Severity | Count |
|----------|-------|
| Critical | 8 |
| High | 5 |
| Medium | 2 |
| Low | 1 |

#### vue3-icons-buttons-tagfilter — Font Awesome, uniform buttons, fetch download, tag filter, graph/fileshare removal
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/main.ts` | frontend | Added `@fortawesome/fontawesome-free/css/all.min.css` import — all sidebar and view icons now render |
| `frontend/src/assets/styles/main.css` | frontend | Added `.btn-xs` (4px 8px, 8px radius) and `.badge-xs` (0.625rem, 2px 6px) CSS classes |
| `frontend/src/views/BuildView.vue` | frontend | Uniform `btn-sm` sizing for all action buttons, `.btn-xs` for profile/history buttons, fetch-based download replacing `window.open` |
| `frontend/src/views/DashboardView.vue` | frontend | Added tag filter input with debounced search, passes `tag` param to API |
| `frontend/src/router/index.ts` | frontend | Removed GraphView route |
| `frontend/src/lib/constants.ts` | frontend | Removed Graph nav item from sidebar |
| `frontend/src/api/client.ts` | frontend | Removed graph API method |
| `src/server/routes/misc-routes.ts` | server | Removed `/api/client-graph` endpoint and `buildClientGraph` import |
| `src/server/routes/page-routes.ts` | server | Removed `/graph` and `/file-share` page routes |
| `src/server/routes/client-routes.ts` | server | Added `tag` query param parsing for client tag filtering |
| `src/db/repositories.ts` | server | Added tag filter SQL clause (`custom_tag LIKE ?`) |
| `src/types.ts` | server | Added `tagFilter?: string` to `ListFilters` |
| `src/main-server.ts` | server | Removed file-share route import, registration, and startup cleanup |
| `test-vue-api.spec.ts` | tests | Removed `/app/graph` from SPA route test list |

#### vue3-buildview-fix — BuildView disappearance bug fix + session fixes + test infra
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/BuildView.vue` | frontend | Fixed platform checkbox disappearance bug: replaced `<label>` + hidden `<input type="checkbox">` with `<div @click.stop>` handlers; added `togglePlatform()`, `togglePersistence()`, `data-platform` attrs, accessibility roles |
| `frontend/src/__tests__/BuildView.test.ts` | tests | Rewritten with `div[data-platform]` selectors; 15 interaction tests covering platform/arch clicks, tab switching, toggles, action buttons — all passing |
| `frontend/src/views/MetricsView.vue` | frontend | Performance fix: chart reuse via `chartsInitialized` flag, `animation: false` + `.update('none')`, `GLOBE_FRAME_MS = 32` throttle, `visibilitychange` pause |
| `frontend/src/views/ScriptsView.vue` | frontend | Fixed textarea fallback always visible when Monaco not loaded; background `#020617`, JetBrains Mono font |
| `frontend/src/views/PluginsView.vue` | frontend | Added Trusted Signing Keys management section (fetch/add/remove); trust badges; fingerprint display; enable confirmation |
| `frontend/src/views/SettingsView.vue` | frontend | Added 60+ missing fields: Security Policy (11), TLS/Certbot (7), OIDC (15), Appearance (15), Chat (4), Registration (4), Build Limits (3), Server Health, Profiler |
| `frontend/src/components/ui/AppSelect.vue` | frontend | NEW custom dropdown component: searchable, keyboard navigable, dark theme glassmorphism styling |
| `frontend/vitest.config.ts` | tests | NEW vitest config: jsdom env, globals, `@` alias, setup file |
| `frontend/src/__tests__/setup.ts` | tests | NEW comprehensive API mocks: 15 modules, 68 mock functions |

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 2 |
| Medium | 3 |
| Low | 3 |

#### vue3-appselect — Replace all native selects with AppSelect custom dropdown
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/DashboardView.vue` | frontend | Replaced 5 native selects (status, OS, group, webcam, sort) with AppSelect; added searchable for groups |
| `frontend/src/views/BuildView.vue` | frontend | Replaced 3 native selects (profile, plugin settings, output extension) with AppSelect; searchable profile picker |
| `frontend/src/views/DeployView.vue` | frontend | Replaced 2 native selects (OS filter, auto-deploy trigger) with AppSelect |
| `frontend/src/views/SettingsView.vue` | frontend | Replaced 2 native selects (OIDC auth method, default role) with AppSelect |
| `frontend/src/views/UserClientAccessView.vue` | frontend | Replaced 2 native selects (user picker, client picker) with AppSelect; searchable |
| `frontend/src/views/SolPublishView.vue` | frontend | Replaced 2 native selects (RPC endpoint, balance RPC) with AppSelect; searchable |
| `frontend/src/views/VoiceView.vue` | frontend | Replaced 1 native select (mic/desktop) with AppSelect |
| `frontend/src/views/WebcamView.vue` | frontend | Replaced 1 native select (device picker) with AppSelect |
| `frontend/src/views/ScreenshotsView.vue` | frontend | Replaced 1 native select (tile size) with AppSelect |
| `frontend/src/views/ScriptsView.vue` | frontend | Replaced 1 native select (script type) with AppSelect |
| `frontend/src/views/Socks5View.vue` | frontend | Replaced 1 native select (client picker) with AppSelect; searchable |
| `frontend/src/views/UsersView.vue` | frontend | Replaced 1 native select (role picker) with AppSelect |

| Severity | Count |
|----------|-------|
| Medium | 1 |
| Low | 11 |

#### vue3-build-scripts-sidebar — BuildView button fix, ScriptsView trigger picker, sidebar color alignment
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/BuildView.vue` | frontend | Converted platform/persistence checkboxes from `<div>` to `<button type="button">` for reliable click behavior; added defensive try-catch in `togglePlatform()`; array validation in `restoreFromStorage()` |
| `frontend/src/views/ScriptsView.vue` | frontend | Added full auto-task creation modal with trigger timing picker (3 options: Every Connection, First Connection, Once per Client), OS filter chips (6 OSes), task name input; trigger display on sidebar auto-task list |
| `frontend/src/components/layout/Sidebar.vue` | frontend | Aligned background from `rgba(2,8,22,0.97)` to `#0a0d14` to match AppLayout |
| `frontend/src/components/layout/AppLayout.vue` | frontend | Aligned topbar background from `rgba(8,12,24,0.72)` to `rgba(10,13,20,0.85)` |
| `frontend/src/__tests__/BuildView.test.ts` | tests | Updated selectors from `div[data-platform]` to `button[data-platform]` |

| Severity | Count |
|----------|-------|
| High | 1 |
| Medium | 2 |
| Low | 2 |

#### vue3-session2 — Console xterm.js, Voice PCM playback, Process memory fix, File context menu, Remove from Dashboard, Settings expansion
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/ConsoleView.vue` | frontend | Complete rewrite with @xterm/xterm v5.5.0 + FitAddon + WebLinksAddon; xterm theme (#050913 bg, #e8edf2 fg, #6ee7b7 cursor); windowsPty conpty for Windows targets; debounced resize (120ms); proper cleanup on unmount |
| `frontend/src/views/VoiceView.vue` | frontend | Raw PCM Int16 playback: Int16→Float32 conversion, linear interpolation upsampling 16kHz→AudioContext rate, AudioBufferSourceNode + AnalyserNode (replaced broken decodeAudioData) |
| `frontend/src/views/ProcessesView.vue` | frontend | Memory display fixed: formatBytes treating server values as bytes (not MB); BigInt masking; proper thresholds (green <100MB, amber <512MB, red ≥512MB) |
| `frontend/src/views/FileBrowserView.vue` | frontend | Right-click context menu (Teleport to body): file menu (Download/Rename/Execute/Silent Execute/Delete), folder menu (Open/Rename/Delete), empty space menu (Upload File/New Folder/Refresh); upload via hidden file input + base64 WS |
| `frontend/src/views/DashboardView.vue` | frontend | "Remove from Dashboard" in context menu for offline clients; DELETE /api/clients/{id}; rose-colored danger styling |
| `frontend/src/views/SettingsView.vue` | frontend | Added Input Archive, Thumbnails, Build Limits (maxBuildsPerHour/maxConcurrentPerUser/globalMaxConcurrent), Registration (defaultRole/maxUsersTotal/defaultGroupIds), Appearance (tabName/logoUrl/heroImageUrl) sections |
| `frontend/src/api/client.ts` | frontend | Added removeClient(); fixed duplicate command key warning |

| Severity | Count |
|----------|-------|
| Critical | 3 |
| High | 2 |
| Medium | 2 |

#### rewrite-v2-stripped-architecture — REWRITE.md v2.0: removed multi-user, branding, registration, file share, MFA, OIDC, 6 platform targets

| File(s) | Component | Description |
|---------|-----------|-------------|
| `REWRITE.md` | docs | Complete rewrite to v2.0: single-admin architecture, 16 DB tables removed (36→20), ~35 config fields removed (~80→45), 6 platform targets removed (only win64/win32/linux64/linux-arm64/linux-armv7 kept), all user/permission/branding/registration/file-share/MFA/OIDC code excluded from rewrite, 25+ leftover artifacts documented as must-not-appear, agent reorganized with platform/ abstraction layer and 5-target Makefile |

| Severity | Count |
|----------|-------|
| High | 1 |

#### vue3-session3 — RemoteDesktop/Backstage full controls, Settings Health/MFA/Profiler fixes, CSP QR fix
| File(s) | Component | Description |
|---------|-----------|-------------|
| `frontend/src/views/RemoteDesktopView.vue` | frontend | Complete rewrite with full toolbar: mouse/keyboard toggles, display selector, quality slider, start/stop, screenshot, fullscreen, reconnect; FRM/JPEG rendering, stats HUD |
| `frontend/src/views/BackstageView.vue` | frontend | Complete rewrite with full toolbar: mouse/keyboard/UIA toggles, display selector, quality slider, browser launchers (6 browsers), start/stop, fullscreen, reconnect; FRM/JPEG rendering |
| `frontend/src/views/SettingsView.vue` | frontend | Fixed health endpoint (/api/settings/health), profiler (POST /api/settings/profile with duration), MFA disable (password+code modal), MFA QR (server qrSvg) |
| `frontend/src/__tests__/SettingsView.test.ts` | tests | Updated nav count 13→15, added Thumbnails + Input Archive label assertions |
| `src/server/http-security.ts` | server | Added https://api.qrserver.com to CSP img-src for MFA QR codes |
| `Issues.md` | docs | NEW: 15 known issues documented across Critical/High/Medium severity |

| Severity | Count |
|----------|-------|
| Critical | 2 |
| High | 3 |
| Medium | 1 |
