# Plugin System

Extensible plugin system supporting multiple runtimes: server-side (Bun), WASM (Plugin 2.0), and native (C/C++/Go/Rust).

**Version:** 2.5.3

## Directory Layout

```
plugins/
├── PLUGINS.md                       # Plugin authoring entry point
├── docs/
│   ├── bundle-format.md             # Plugin bundle format specification
│   ├── server-side.md               # Server-side plugin development
│   ├── wasm-plugins.md              # WASM Plugin 2.0 development
│   ├── signing.md                   # Ed25519 plugin signing
│   ├── install-manage.md            # Plugin installation and management
│   ├── samples.md                   # Sample plugin reference
│   └── legacy-native.md            # Legacy native plugin documentation
├── sample-build-hooks/              # Server-only: custom Build page button
├── sample-ts-fullstack/             # TypeScript UI + TypeScript server runtime
├── sample-wasm/                     # C/WASI WASM example
├── sample-wasm-hostinfo/            # TinyGo WASM HostInfo example
├── sample-wasm-platform-note/       # Rust WASM platform-aware example
├── sample-c/                        # Legacy native C plugin
├── sample-cpp/                      # Legacy native C++ plugin
├── sample-go/                       # Legacy native Go plugin (uses WASM too)
│   ├── native/                      # Go native shared library
│   └── wasm/                        # Go WASM component
├── sample-rust/                     # Legacy native Rust plugin
├── chat/                            # Chat plugin (C++ native + server-side JS)
└── regedit/                         # Registry editor plugin (native C++)
```

## Plugin Types

### 1. Server-Side Plugins (Plugin 2.0)
- Run in Bun worker threads on the server
- Can add custom UI pages, buttons, routes
- Have access to server APIs (client management, builds, etc.)
- Example: `sample-build-hooks/`, `sample-ts-fullstack/`

### 2. WASM Plugins (Plugin 2.0)
- Run sandboxed on agents via wazero runtime
- Support declared permissions and bridge APIs
- Languages: C, TinyGo, Rust (any WASI-compatible compiler)
- Examples: `sample-wasm/`, `sample-wasm-hostinfo/`, `sample-wasm-platform-note/`

### 3. Native Plugins (Legacy)
- Loaded as shared libraries (DLL/SO/dylib)
- Languages: C, C++, Go, Rust
- Less sandboxed, more powerful
- Examples: `sample-c/`, `sample-cpp/`, `sample-go/`, `sample-rust/`
- Production: `chat/` (C++ component), `regedit/` (C++ registry editor)

## Plugin Signing

- Ed25519 key-based signing
- Server validates signatures before loading
- Sign tool: `Goylord-Server/scripts/plugin-sign.ts`
- Documentation: `docs/signing.md`

## Plugin Permissions

Plugins can request specific permissions:
- File system access
- Process access
- Network access
- UI injection
- Server API access

## Plugin Metadata

Plugins can include metadata (stored in `plugin_meta` column on `clients` table):
- Plugin name, version, description
- Enabled/disabled state
- Permission grants

## Bundle Format

Plugins are distributed as bundles containing:
- Runtime binary (WASM or native shared library)
- Metadata (manifest.json or similar)
- UI assets (for server-side plugins)
- Signature file
