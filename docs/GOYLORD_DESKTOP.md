# Goylord-Desktop

Native desktop "fat client" built with **Tauri 2** (Rust backend + system webview). Provides a lightweight operator interface for connecting to the Goylord server.

**Version:** 2.5.3

## Directory Layout

```
Goylord-Desktop/
├── package.json                     # Tauri CLI, Inter font, Font Awesome
├── README.md                        # Features, build process, configuration
├── PLEASE_READ.txt                  # Distribution notice
├── scripts/
│   └── vendor.ts                    # Copies Inter font + Font Awesome into src/vendor/
├── src/
│   ├── index.html                   # Connection screen HTML
│   ├── renderer.js                  # Frontend: loads saved connection, validates, calls Tauri IPC
│   ├── style.css                    # Connection screen styling
│   └── vendor/                      # Font Awesome + Inter (vendored)
└── src-tauri/
    ├── Cargo.toml                   # Rust deps: tauri, reqwest, serde, url
    ├── tauri.conf.json              # NSIS (Windows), DMG (macOS), AppImage (Linux)
    ├── src/
    │   └── lib.rs                   # Rust backend: IPC commands, TLS bypass, popup windows
    └── icons/                       # App icons for all platforms
```

## Features

- **Connection Screen**: Enter server address, toggle TLS, accept self-signed certs
- **Memory**: Remembers last server connection
- **Popup Windows**: Console, HVNC, audio sessions open as native windows (inheriting auth cookies)
- **Lightweight**: ~10MB installer vs ~80MB Electron alternative
- **Cross-Platform**: Windows (NSIS), macOS (DMG), Linux (AppImage)

## Tauri IPC Commands

| Command | Description |
|---|---|
| `get_saved_connection` | Retrieve last used server address |
| `connect_to_server` | Validate connection, open main webview |
| `go_back_to_connect` | Return to connection screen |

## Build

```bash
# Using scripts
scripts/build-desktop.bat    # Windows
scripts/build-desktop.sh     # Linux/macOS

# Or directly
cd src-tauri && cargo tauri build
```

## Rust Backend (`lib.rs`)

- Uses `reqwest` with TLS bypass for initial connectivity check
- Saves connection config to local storage
- Handles `window.open` events for popup sessions (console, HVNC, audio)
- All popups inherit auth cookies from main webview
