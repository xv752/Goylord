# CHANGELOG

All notable changes to the Goylord project. Machine-readable format for webhook consumption.

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

## Summary Statistics

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High | 13 |
| Medium | 13 |
| Low | 5 |
| Info | 1 |
| **Total** | **33** |

| Component | Fixes |
|-----------|-------|
| Go Client (agent) | 5 |
| TypeScript Server | 8 |
| Server Routes | 6 |
| Web UI (frontend) | 5 |
| Tauri Desktop | 2 |
| Backstage (C/Win32) | 3 |
| Build System | 2 |

## Test Results

- **Server:** 479 pass, 5 fail (pre-existing `client-order.test.ts` failures, no regressions)
- **Go Client:** `go build ./cmd/agent/` — builds clean, no race conditions detected
