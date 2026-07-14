# Sample Plugins

The `plugins/` directory includes small examples that exercise each plugin style.

| Directory | Demonstrates |
|-----------|--------------|
| `sample-build-hooks` | Server-only build plugin, custom Build page action, build settings, and replacing the produced artifact with a `.txt` file. |
| `sample-ts-fullstack` | TypeScript UI and TypeScript server runtime with shared local modules. |
| `sample-wasm` | Plugin 2.0 WASM module built from C/WASI. |
| `sample-wasm-hostinfo` | TinyGo WASM plugin that queries HostInfo. |
| `sample-wasm-platform-note` | Rust WASM plugin that branches by HostInfo/platform. |
| `sample-c` | Legacy native C plugin for the smallest unloadable ABI surface. |
| `sample-cpp` | Legacy native C++ plugin using exported C ABI functions. |
| `sample-go` | Legacy native Go plugin. Go plugins are intentionally not unloaded because the Go runtime cannot be safely unloaded from shared libraries. |
| `sample-rust` | Legacy native Rust plugin with C ABI exports and unload-friendly runtime handling. |

Use `sample-build-hooks` as the starting point for uploaders, artifact publishers, or custom release buttons.
