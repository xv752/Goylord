# Base64 Encoder Plugin

A server-only build plugin that base64-encodes built agent binaries. Useful for CI testing to verify the build pipeline produces valid output without distributing raw binaries.

## What It Does

When enabled on the Build page, this plugin intercepts each build artifact after compilation and replaces it with a base64-encoded `.b64` file. The encoded file can be decoded back to the original binary with any base64 decoder.

## Install

1. Run `build.bat` to create `base64-encoder.zip`
2. Upload the zip from the Plugins page, or place it under `Goylord-Server/plugins/`
3. Enable the plugin in the Plugin Manager

## Use

1. Go to the Build page
2. In the **Build Plugins** section, enable **Base64 Encoder**
3. Select your target platforms and build
4. The downloaded files will be `.b64` text files instead of binaries

## Decode

```bash
# Linux/macOS
base64 -d agent.b64 > agent.exe

# Windows PowerShell
[System.IO.File]::WriteAllBytes("agent.exe", [System.Convert]::FromBase64String((Get-Content agent.b64 -Raw)))
```

## How It Works

The plugin implements the `onBuildArtifact` hook in `server.js`:

1. Reads the compiled binary from `payload.file.path`
2. Base64-encodes it with `Buffer.toString("base64")`
3. Writes the encoded output to `payload.outDir`
4. Returns `{ file: { filename: "agent.b64" } }` to replace the downloadable artifact

See `plugins/docs/server-side-plugins.md` for details on the `onBuildArtifact` hook.
