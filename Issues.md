# Known Issues — Vue 3 Frontend Migration

## Critical

### 1. Remote Desktop — Missing Core Features
**Status:** Partially implemented
- No mouse/keyboard control toggles (always sends input)
- No display/monitor selector
- No stream profile selector (720p/1080p)
- No clipboard sync
- No privacy mode
- No audio streaming
- No WebRTC transport
- No recording controls
- No fullscreen button
- No shared UI settings persistence
- No feature access check

### 2. Backstage (HVNC) — Missing Core Features
**Status:** Partially implemented
- No mouse/keyboard/UIA control toggles
- No browser launcher context menu (Chrome, Firefox, Edge, etc.)
- No profile clone functionality
- No installed apps browser
- No resolution/FPS selectors
- No display selector
- No fullscreen button
- No canvas zoom
- No commands button

### 3. Settings — MFA QR Code Blocked by CSP
**Status:** Bug — CSP `img-src` missing `https://api.qrserver.com`
- QR code for MFA setup uses external QR server API
- Server generates `qrSvg` inline but frontend uses external URL instead

### 4. Settings — Health Endpoint 404
**Status:** Bug — Wrong endpoint path
- Frontend calls `/api/system/health` (does not exist)
- Should call `/api/settings/health`
- Profiler calls `/api/system/profiler` — should call `/api/settings/profile`

## High

### 5. Settings — Missing Sections vs Old UI
- Active Sessions list
- Banned IPs management (unban)
- Build IDs table (claims, block/unblock)
- Wipe Offline Clients button
- Access Overview / Permissions summary
- Registration Key management (generate, list, export, delete keys)
- Pending Registrations table (approve/deny)
- Simple Theme builder (color pickers with live preview)
- News & Updates section
- Dashboard Preferences (notifications, refresh interval, nav layout)
- Quick Export/Import (JSON-only, separate from ZIP backup)
- Force GC button on health page
- CPU profile download button
- Profiler duration selector (3s/5s/10s/30s)

### 6. Settings — MFA Disable Broken
- `disableMfa()` sends empty `currentPassword` and `code`
- Server requires both for security
- Need input fields for password + TOTP code before disabling

### 7. Settings — `saveProfile()` Does Nothing
- Line 157-159 just sets success message without calling any API
- Should call `PATCH /api/users/:id` or similar

### 8. Processes — Missing Tree View
- No parent-child tree from `ppid` field
- No collapse/expand nodes
- No kill process tree
- No suspend/resume
- No process icons (batch `process_icon` requests)
- No context menu
- No self-process badge

### 9. Keylogger — Missing Features
- No download (rot13 decode + save as .txt)
- No delete per file (`keylog_delete`)
- No archive mode (offline client logs)
- No rot13 decoding of content
- No syntax highlighting (timestamps green, windows cyan, keys amber)
- No global search across all files
- No match navigation (prev/next)
- No file metadata (size, date, line count)

## Medium

### 10. CSP — Multiple Missing Origins
- `https://api.qrserver.com` — MFA QR codes
- `wss:` — WebSocket connections may need explicit allowance
- `https://fonts.googleapis.com` — if Google Fonts used

### 11. Settings — Registration Key Management
- Current: single text input for one key
- Needed: generate keys (count, label, expiry), key table, export, delete
- Endpoints: `GET/POST /api/registration/keys`, `DELETE /api/registration/keys/:id`, `GET /api/registration/keys/export`

### 12. Settings — Pending Registrations
- Current: completely absent
- Needed: table of pending users, approve/deny buttons
- Endpoint: `GET /api/registration/pending`

### 13. Voice — Audio Quality
- Playback may crackle on some browsers due to linear interpolation
- Could use AudioWorklet for better quality

### 14. Console — No Split/Tiling
- Old UI supports multiple consoles
- Vue frontend: single terminal only

### 15. BuildView — No Download After Build
- Build artifacts should auto-download when complete
- Currently requires manual history navigation
