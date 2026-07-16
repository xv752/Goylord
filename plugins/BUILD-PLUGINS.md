# Build Plugins — Developer Guide

This guide covers everything you need to create plugins that hook into the Goylord agent build pipeline. Build plugins can observe builds, modify build configuration, transform output binaries, replace artifacts, and trigger post-build actions.

For the general plugin system overview, see [PLUGINS.md](PLUGINS.md). For server-side plugin basics (lifecycle, RPC, data), see [docs/server-side-plugins.md](docs/server-side-plugins.md).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [How Build Plugins Work](#how-build-plugins-work)
3. [Plugin Structure](#plugin-structure)
4. [config.json Manifest](#configjson-manifest)
5. [Build Hooks Reference](#build-hooks-reference)
6. [Artifact Replacement (The Crypter Pattern)](#artifact-replacement-the-crypter-pattern)
7. [Build Settings and UI](#build-settings-and-ui)
8. [Build Actions (Buttons)](#build-actions-buttons)
9. [Platform Filtering](#platform-filtering)
10. [Working with Build Modes](#working-with-build-modes)
11. [Examples](#examples)
12. [Source Code References](#source-code-references)
13. [Security and RBAC](#security-and-rbac)
14. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Minimal Build Plugin

**config.json:**
```json
{
  "id": "my-plugin",
  "name": "My Build Plugin",
  "apiVersion": 2,
  "runtime": "server",
  "version": "1.0.0",
  "description": "A simple build plugin.",
  "build": {
    "label": "My Plugin",
    "description": "Appears in the Build Plugins section."
  }
}
```

**server.js:**
```js
export default {
  setup(ctx) {
    ctx.log.info("my-plugin ready");
  },

  onBuildArtifact(ctx, payload) {
    ctx.log.info(`artifact ready: ${payload.file.filename} (${payload.file.size} bytes)`);
    return { message: `saw ${payload.file.filename}` };
  },
};
```

### Package and Install

1. Run `build.bat` to create `my-plugin.zip`
2. Upload from the Plugins page or place under `Goylord-Server/plugins/`
3. Enable in the Plugin Manager
4. Go to Build page → **Build Plugins** section appears with your plugin

---

## How Build Plugins Work

Build plugins are **server-side plugins** (`runtime: "server"`) that participate in the agent build pipeline. The server starts a Worker thread for each enabled plugin and invokes build hooks at 20+ lifecycle points during compilation.

### Build Pipeline Flow

```
User clicks "Start Build"
  → POST /api/build/start
  → Rate limit check
  → Input validation + plugin settings sanitization
  → Build starts (async)

Per platform (e.g., windows-x64):
  1. prepare hook         — modify build config
  2. target hook          — skip/modify per-platform
  3. go build compiles    — agent binary created
  4. post_build hook      — after raw compilation
  5. before_upx/after_upx — UPX compression (if enabled)
  6. before_script_wrapper/after_script_wrapper — .bat/.cmd/.ps1 wrapping
  7. before_ipa/after_ipa — iOS IPA packaging
  8. before_donut/after_donut — PE to shellcode
  9. before_linux_shellcode/after_linux_shellcode
  10. before_sgn/after_sgn — SGN encoding
  11. artifact hook        — replace/augment output ← KEY HOOK FOR CRYPTERS
  12. complete hook        — build finished
  13. failed hook          — build failed

  → Files saved to dist-clients/
  → Optionally uploaded to file share (build&upload)
  → Optionally pushed to clients (build&update-all)
```

### How the Worker Executes Hooks

The server calls `runBuildHookForAll(hookName, payload)` which iterates all running plugin Workers and dispatches the hook. Each plugin's `worker-host.ts` routes the call to the appropriate export function.

**Source:** `Goylord-Server/src/server/plugin-runtime/runtime.ts:281-293`

```ts
async runBuildHookForAll(hook: string, payload: unknown) {
  const results: Array<{ pluginId: string; result: unknown }> = [];
  for (const [id, instance] of this.instances) {
    if (!instance.running) continue;
    const result = await this.runBuildHook(id, instance, hook, payload);
    results.push({ pluginId: id, result });
  }
  return results;
}
```

**Source:** `Goylord-Server/src/server/plugin-runtime/worker-host.ts:144-184`

The Worker host resolves hook names to exported functions:

| Hook name | Resolves to |
|-----------|-------------|
| `prepare` | `buildHooks.prepare` or `onBuildPrepare` |
| `target` | `buildHooks.target` or `onBuildTarget` |
| `post_build` | `buildHooks.post_build` or `onBuildPostBuild` |
| `artifact` | `buildHooks.artifact` or `onBuildArtifact` |
| `complete` | `buildHooks.complete` or `onBuildComplete` |
| `failed` | `buildHooks.failed` or `onBuildFailed` |

---

## Plugin Structure

A build plugin bundle is a zip with a root `config.json`, browser assets, and a `server.js`:

```
my-plugin.zip
  config.json              ← required: manifest with build config
  server.js                ← required: build hook implementations
  my-plugin.html           ← optional: plugin page UI
  my-plugin.css            ← optional: plugin page styles
  my-plugin.js             ← optional: plugin page JavaScript
```

### Files

| File | Required | Purpose |
|------|----------|---------|
| `config.json` | Yes | Plugin manifest. Defines metadata, build settings, actions, and requirements. |
| `server.js` | Yes | Server-side runtime. Exports build hook functions. |
| `*.html` | No | Plugin page served at `/plugins/<id>`. |
| `*.css` | No | Styles for the plugin page. |
| `*.js` | No | Client-side JavaScript for the plugin page. |

### Packaging

Use `build.bat` (Windows) or manually zip the files. The zip must contain `config.json` at the root.

```bat
@echo off
set "PLUGIN_NAME=my-plugin"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path @('config.json', 'server.js', '%PLUGIN_NAME%.html', '%PLUGIN_NAME%.css', '%PLUGIN_NAME%.js') -DestinationPath '%PLUGIN_NAME%.zip' -Force"
```

---

## config.json Manifest

### Base Fields

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "apiVersion": 2,
  "runtime": "server",
  "version": "1.0.0",
  "description": "Plugin description.",
  "build": { ... }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique plugin ID. Alphanumeric, hyphens, underscores. Max 128 chars. |
| `name` | string | Yes | Display name shown in Plugin Manager and Build page. |
| `apiVersion` | number | Yes | Must be `2`. |
| `runtime` | string | Yes | Must be `"server"` for build plugins. |
| `version` | string | Yes | Semver version. |
| `description` | string | Yes | Short description. |
| `build` | object | Yes | Build pipeline configuration. See below. |

### Build Configuration

```json
{
  "build": {
    "label": "My Build Plugin",
    "description": "Description shown in the Build Plugins section.",
    "enabledByDefault": false,
    "settings": [ ... ],
    "actions": [ ... ],
    "requires": [ ... ]
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `label` | string | `name` | Short label for the Build Plugins UI card. |
| `description` | string | `""` | Description shown below the label. |
| `enabledByDefault` | boolean | `true` | Whether the plugin is enabled by default when loaded. |
| `settings` | array | `[]` | User-configurable settings shown in the Build UI. |
| `actions` | array | `[]` | Quick-action buttons in the Build UI. |
| `requires` | array | `[]` | Conditions that must be met before the plugin can be used. |

---

## Build Hooks Reference

### Hook Signatures

All hooks receive `(ctx, payload)` and can return `null` (no action) or an object with effects.

```js
export default {
  onBuildPrepare(ctx, payload) { ... },
  onBuildTarget(ctx, payload) { ... },
  onBuildArtifact(ctx, payload) { ... },
  onBuildComplete(ctx, payload) { ... },
  onBuildFailed(ctx, payload) { ... },

  buildHooks: {
    post_build(ctx, payload) { ... },
    before_upx(ctx, payload) { ... },
    after_upx(ctx, payload) { ... },
    before_donut(ctx, payload) { ... },
    after_donut(ctx, payload) { ... },
    before_sgn(ctx, payload) { ... },
    after_sgn(ctx, payload) { ... },
    // ... etc
  },
};
```

You can use either the named `onBuild*` methods or the `buildHooks` map with snake_case names. They are equivalent.

### Complete Hook Table

| Hook | Named method | When it fires | Can modify? |
|------|-------------|---------------|-------------|
| `prepare` | `onBuildPrepare` | Before any compilation starts | Yes — config patches |
| `target` | `onBuildTarget` | Per-platform, before `go build` | Yes — env, tags, ldflags, skip |
| `post_build` | `onBuildPostBuild` | After `go build` completes | No (observation) |
| `before_upx` | `onBuildBeforeUpx` | Before UPX compression | Yes — can skip |
| `after_upx` | `onBuildAfterUpx` | After UPX compression | No (observation) |
| `before_script_wrapper` | `onBuildBeforeScriptWrapper` | Before .bat/.cmd/.ps1 wrapping | Yes — can skip |
| `after_script_wrapper` | `onBuildAfterScriptWrapper` | After .bat/.cmd/.ps1 wrapping | No (observation) |
| `before_ipa` | `onBuildBeforeIpa` | Before iOS IPA packaging | Yes — can skip |
| `after_ipa` | `onBuildAfterIpa` | After iOS IPA packaging | No (observation) |
| `before_donut` | `onBuildBeforeDonut` | Before Donut shellcode conversion | Yes — can skip |
| `after_donut` | `onBuildAfterDonut` | After Donut shellcode conversion | No (observation) |
| `before_linux_shellcode` | `onBuildBeforeLinuxShellcode` | Before Linux shellcode wrapping | Yes — can skip |
| `after_linux_shellcode` | `onBuildAfterLinuxShellcode` | After Linux shellcode wrapping | No (observation) |
| `before_sgn` | `onBuildBeforeSgn` | Before SGN encoding | Yes — can skip |
| `after_sgn` | `onBuildAfterSgn` | After SGN encoding | No (observation) |
| `before_sgn_txt` | `onBuildBeforeSgnTxt` | Before SGN TXT conversion | Yes — can skip |
| `after_sgn_txt` | `onBuildAfterSgnTxt` | After SGN TXT conversion | No (observation) |
| `artifact` | `onBuildArtifact` | After all processing, before file saved | Yes — replace output |
| `complete` | `onBuildComplete` | Build finished successfully | No (post-build actions) |
| `failed` | `onBuildFailed` | Build failed | No (error handling) |

### prepare Hook

Fires once before any platform compilation. Use this to modify the build configuration.

**Payload:**
```js
{
  buildId: "abc-123",
  config: { platforms: ["windows-x64"], obfuscate: true, ... }
}
```

**Return value:**
```js
{
  config: { outputName: "custom-agent" }  // merges into build config
}
```

**Source:** `Goylord-Server/src/server/build-process.ts:614-621`

### target Hook

Fires per-platform before `go build`. This is where you can skip platforms, modify environment variables, or change build tags.

**Payload:**
```js
{
  buildId: "abc-123",
  platform: "windows-x64",
  os: "windows",
  arch: "amd64",
  targetKey: "windows-amd64",
  outDir: "/path/to/dist-clients/abc-123",
  clientDir: "/path/to/Goylord-Client",
  config: { ... full build config ... },
  outputName: "goylord-agent",
  env: { GOOS: "windows", GOARCH: "amd64", ... },
  ldflags: "-X main.version=0.0.3 ...",
  tags: ["builder_release", "keylogger"]
}
```

**Return value:**
```js
{
  skip: true,                    // skip this platform entirely
  env: { CGO_ENABLED: "0" },    // merge into environment
  ldflags: "-X ...",            // replace ldflags
  ldflagsAppend: "-X extra=1", // append to ldflags
  tags: ["tag1", "tag2"],       // replace tags
  addTags: ["extra_tag"],       // add to tags
  removeTags: ["unwanted"],     // remove from tags
  outputName: "custom-name",    // rename output
  message: "linux skipped"      // log message
}
```

**Source:** `Goylord-Server/src/server/build-process.ts:1408-1452`

**Note:** The `builder_release` tag is always present and cannot be removed by plugins.

### artifact Hook (KEY HOOK)

Fires after all post-processing (UPX, shellcode, SGN, etc.) and before the file is saved as a downloadable build artifact. **This is the hook crypters, encoders, and post-processors use.**

**Payload:**
```js
{
  buildId: "abc-123",
  platform: "windows-x64",
  os: "windows",
  arch: "amd64",
  outDir: "/path/to/dist-clients/abc-123",
  config: { ... full build config ... },
  file: {
    name: "goylord-agent",
    filename: "goylord-agent.exe",
    path: "/path/to/dist-clients/abc-123/goylord-agent.exe",
    platform: "windows-x64",
    version: "0.0.3",
    size: 12345678
  }
}
```

**Return value:**
```js
{
  file: { filename: "crypted-agent.exe" },           // replace the artifact
  files: [{ filename: "extra.txt", platform: "..." }], // add extra artifacts
  message: "artifact replaced with crypted version"   // log message
}
```

**Source:** `Goylord-Server/src/server/build-process.ts:2095-2158`

### complete Hook

Fires after all platforms are built and artifacts are saved.

**Payload:**
```js
{
  buildId: "abc-123",
  status: "completed",
  files: [{ filename: "goylord-agent.exe", size: 12345, platform: "windows-x64" }],
  outputDir: "/path/to/dist-clients/abc-123",
  expiresAt: 1234567890,
  userId: 1,
  config: { ... }
}
```

### failed Hook

Fires when the build fails.

**Payload:**
```js
{
  buildId: "abc-123",
  status: "failed",
  error: "exit status 1",
  files: [],
  userId: 1,
  config: { ... }
}
```

---

## Artifact Replacement (The Crypter Pattern)

This is the most common use case for build plugins: reading the compiled binary, transforming it, and replacing the output.

### Step-by-Step

1. **Read the binary:**
   ```js
   const data = fs.readFileSync(payload.file.path);
   ```

2. **Transform it:**
   ```js
   const transformed = myEncrypt(data, key);
   ```

3. **Write output:**
   ```js
   const outputPath = path.join(payload.outDir, "crypted-agent.exe");
   fs.writeFileSync(outputPath, transformed);
   ```

4. **Replace the artifact:**
   ```js
   return {
     file: { filename: "crypted-agent.exe" },
     message: "Encryption applied"
   };
   ```

### Full Example

```js
import fs from "fs";
import path from "path";

export default {
  onBuildArtifact(ctx, payload) {
    const record = payload.config?.buildPlugins?.[ctx.pluginId];
    if (!record?.enabled) return null;

    const key = String(record.settings?.key || "");
    if (!key) return { message: "No key provided, skipping" };

    const data = fs.readFileSync(payload.file.path);
    const encrypted = xorEncrypt(data, key);

    const outName = "crypted-" + payload.file.filename;
    fs.writeFileSync(path.join(payload.outDir, outName), encrypted);

    return {
      file: { filename: outName },
      message: `Encrypted ${data.length} bytes`
    };
  },
};
```

### Important Notes

- The `payload.file.path` is the absolute path to the compiled binary in `dist-clients/<buildId>/`
- You write your output to the same `payload.outDir` directory
- Return `{ file: { filename } }` to replace the downloadable artifact
- Return `{ files: [...] }` to add extra downloadable files
- The original file is NOT deleted — you're just changing what the download link points to
- Multiple plugins can chain: each sees the output of the previous plugin's artifact hook

### Works with All Build Modes

| Build Mode | Plugin Effect |
|------------|---------------|
| **Start Build** | Download link points to plugin output |
| **Build & Upload** | Uploaded file is the plugin output |
| **Build & Update All** | Pushed file is the plugin output |

The plugin runs during the build, before files are saved/uploaded/pushed. No additional integration needed.

---

## Build Settings and UI

Settings appear as form inputs in the Build Plugins section of the build page.

### Setting Types

| Type | Input | Config |
|------|-------|--------|
| `boolean` | Checkbox | `"type": "boolean"` |
| `number` | Number input | `"type": "number", "min": 0, "max": 100` |
| `string` | Text input (1K chars) | `"type": "string"` |
| `textarea` | Textarea (10K chars) | `"type": "textarea"` |
| `select` | Dropdown | `"type": "select", "options": [...]` |

### Select Options

```json
{
  "key": "method",
  "label": "Encryption Method",
  "type": "select",
  "options": [
    { "value": "xor", "label": "XOR" },
    { "value": "aes", "label": "AES-256" }
  ],
  "default": "xor"
}
```

### Setting Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `key` | string | Yes | Internal key. Used to access the value in hooks. |
| `label` | string | Yes | Display label in the UI. |
| `type` | string | Yes | One of: `boolean`, `number`, `string`, `textarea`, `select`. |
| `default` | any | No | Default value. |
| `required` | boolean | No | If `true`, build fails when empty. |
| `placeholder` | string | No | Placeholder text for text inputs. |
| `options` | array | No | For `select` type: `[{ value, label }]`. |
| `min` | number | No | For `number` type: minimum value. |
| `max` | number | No | For `number` type: maximum value. |

### Accessing Settings in Hooks

```js
onBuildArtifact(ctx, payload) {
  const record = payload.config?.buildPlugins?.[ctx.pluginId];
  if (!record?.enabled) return null;

  const method = record.settings?.method || "xor";
  const key = record.settings?.key || "";
  // ...
}
```

### Sanitization

Settings are server-side sanitized before hooks receive them (`Goylord-Server/src/server/routes/build-routes.ts:71-127`):

- `boolean`: coerced to boolean
- `number`: clamped to min/max
- `select`: validated against allowed options
- `text`: truncated to 1,000 chars
- `textarea`: truncated to 10,000 chars

### Form Persistence

Build plugin settings are saved to localStorage alongside other build form settings. When the user returns to the Build page, their previous plugin selections are restored.

**Source:** `Goylord-Server/public/assets/build.js:454-468` (applyBuildPluginSettings), `Goylord-Server/public/assets/build.js:470-484` (loadBuildPlugins)

---

## Build Actions (Buttons)

Actions are quick-action buttons that set multiple build fields and plugin settings at once.

```json
{
  "build": {
    "actions": [
      {
        "id": "quick-xor",
        "label": "Quick XOR",
        "icon": "fa-solid fa-bolt",
        "setBuild": { "useDonut": true },
        "setSettings": { "method": "xor", "key": "change-me" }
      }
    ]
  }
}
```

### Action Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique action ID. |
| `label` | string | Button text. |
| `icon` | string | Font Awesome class (e.g., `fa-solid fa-bolt`). |
| `setBuild` | object | Sets core build fields (e.g., `useDonut`, `obfuscate`). |
| `setSettings` | object | Sets this plugin's settings. |

**Source:** `Goylord-Server/public/assets/build.js:367-452` (renderBuildPlugins action button rendering)

---

## Platform Filtering

### Via Requires

Use `requires` to declare platform constraints:

```json
{
  "build": {
    "requires": [
      {
        "field": "platforms",
        "includes": ["windows-x64"],
        "message": "This plugin only supports Windows x64."
      }
    ]
  }
}
```

### Via Build Hooks

Use `onBuildTarget` to skip unsupported platforms at runtime:

```js
onBuildTarget(ctx, payload) {
  if (payload.platform !== "windows-x64") {
    ctx.log.info(`skipping ${payload.platform}`);
    return { skip: true };
  }
}
```

### Via Settings

Check `payload.config.platforms` in any hook:

```js
onBuildArtifact(ctx, payload) {
  const platforms = payload.config?.platforms || [];
  if (!platforms.includes("windows-x64")) {
    return { message: "not a windows build, skipping" };
  }
}
```

---

## Working with Build Modes

### Build

Standard build. Plugin runs, artifact is replaced, download link points to plugin output.

### Build & Upload

Same as Build, but after the plugin transforms the artifact, the file is uploaded to the file share. The uploaded file is the plugin output.

**Source:** `Goylord-Server/src/server/build-process.ts` — `uploadToFileShare` check runs after artifact hooks.

### Build & Update All

Same as Build, but after the plugin transforms the artifact, the file is pushed to all eligible clients. The pushed file is the plugin output.

**Source:** `Goylord-Server/src/server/build-process.ts` — update-all push runs after build completion.

### Key Point

You don't need to do anything special for Build & Upload or Build & Update All. The plugin runs during the build phase, and the final artifacts (after all plugin transformations) are what get uploaded/pushed.

---

## Examples

### Example 1: Base64 Encoder (CI Testing)

A simple plugin that base64-encodes the built binary. Useful for verifying the build pipeline produces output without distributing raw binaries.

**config.json:**
```json
{
  "id": "base64-encoder",
  "name": "Base64 Encoder",
  "apiVersion": 2,
  "runtime": "server",
  "version": "1.0.0",
  "description": "Base64-encodes the built agent.",
  "build": {
    "label": "Base64 Encoder",
    "description": "Replaces the built agent with its base64-encoded version."
  }
}
```

**server.js:**
```js
import fs from "fs";
import path from "path";

export default {
  onBuildArtifact(ctx, payload) {
    const data = fs.readFileSync(payload.file.path);
    const encoded = data.toString("base64");

    const outName = path.basename(payload.file.filename, path.extname(payload.file.filename)) + ".b64";
    fs.writeFileSync(path.join(payload.outDir, outName), encoded, "utf8");

    return {
      file: { filename: outName },
      message: `Encoded ${data.length} bytes to ${outName}`
    };
  },
};
```

### Example 2: Crypter Template

A template showing how to build a crypter with configurable encryption method and key.

**config.json:**
```json
{
  "id": "crypter-template",
  "name": "Crypter Template",
  "apiVersion": 2,
  "runtime": "server",
  "version": "1.0.0",
  "description": "Template for building a crypter plugin.",
  "build": {
    "label": "Crypter",
    "description": "Transforms the built agent using the selected method.",
    "settings": [
      {
        "key": "method",
        "label": "Method",
        "type": "select",
        "options": [
          { "value": "xor", "label": "XOR (Demo)" },
          { "value": "rc4", "label": "RC4" },
          { "value": "aes", "label": "AES-256" }
        ],
        "default": "xor"
      },
      {
        "key": "key",
        "label": "Key",
        "type": "string",
        "required": true,
        "placeholder": "Encryption key"
      }
    ],
    "requires": [
      {
        "field": "useUpx",
        "falsy": true,
        "message": "Disable UPX before using the crypter."
      }
    ]
  }
}
```

**server.js:**
```js
import fs from "fs";
import path from "path";
import crypto from "crypto";

function xorTransform(data, key) {
  const keyBuf = Buffer.from(key, "utf8");
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBuf[i % keyBuf.length];
  }
  return out;
}

export default {
  setup(ctx) {
    ctx.log.info("crypter ready");
  },

  onBuildArtifact(ctx, payload) {
    const record = payload.config?.buildPlugins?.[ctx.pluginId];
    if (!record?.enabled) return null;

    const key = String(record.settings?.key || "");
    const method = String(record.settings?.method || "xor");

    if (!key) return { message: "No key provided" };

    const data = fs.readFileSync(payload.file.path);
    const transformed = xorTransform(data, key);

    const outName = "crypted-" + payload.file.filename;
    fs.writeFileSync(path.join(payload.outDir, outName), transformed);

    return {
      file: { filename: outName },
      message: `${method.toUpperCase()} transformed ${data.length} bytes`
    };
  },
};
```

### Example 3: Build Observer (No Transformation)

A plugin that just logs build events without modifying anything.

```js
export default {
  onBuildPrepare(ctx, payload) {
    ctx.log.info(`build starting: ${payload.buildId}`);
    ctx.log.info(`platforms: ${payload.config?.platforms?.join(", ")}`);
  },

  onBuildTarget(ctx, payload) {
    ctx.log.info(`target: ${payload.platform} (${payload.os}/${payload.arch})`);
  },

  onBuildArtifact(ctx, payload) {
    ctx.log.info(`artifact: ${payload.file.filename} (${payload.file.size} bytes)`);
  },

  onBuildComplete(ctx, payload) {
    ctx.log.info(`build ${payload.buildId} done: ${payload.files?.length} files`);
    ctx.broadcast("build_done", { buildId: payload.buildId });
  },

  onBuildFailed(ctx, payload) {
    ctx.log.warn(`build ${payload.buildId} failed: ${payload.error}`);
  },
};
```

---

## Source Code References

### Build Hook Infrastructure

| File | Lines | Purpose |
|------|-------|---------|
| `Goylord-Server/src/server/build-process.ts` | 138-196 | Hook runner types, `runBuildHooks()`, message normalization |
| `Goylord-Server/src/server/build-process.ts` | 198-238 | `mergeBuildConfigPatch()`, `buildTransformHookPayload()` |
| `Goylord-Server/src/server/build-process.ts` | 614-621 | `prepare` hook execution |
| `Goylord-Server/src/server/build-process.ts` | 1408-1452 | `target` hook execution |
| `Goylord-Server/src/server/build-process.ts` | 2095-2158 | `artifact` hook execution |
| `Goylord-Server/src/server/build-process.ts` | 2204-2217 | `complete` hook execution |
| `Goylord-Server/src/server/build-process.ts` | 2240-2252 | `failed` hook execution |

### Plugin Runtime

| File | Lines | Purpose |
|------|-------|---------|
| `Goylord-Server/src/server/plugin-runtime/runtime.ts` | 281-293 | `runBuildHookForAll()` — iterates all plugin Workers |
| `Goylord-Server/src/server/plugin-runtime/worker-host.ts` | 144-184 | Worker hook dispatch — resolves hook names to exports |
| `Goylord-Server/src/server/plugin-runtime/types.ts` | 1-45 | Worker message types |

### Build Routes

| File | Lines | Purpose |
|------|-------|---------|
| `Goylord-Server/src/server/routes/build-routes.ts` | 38-43 | `BuildRouteDeps` type |
| `Goylord-Server/src/server/routes/build-routes.ts` | 45-127 | Plugin requirement checking and settings sanitization |
| `Goylord-Server/src/server/routes/build-routes.ts` | 549-554 | Plugin validation before build start |
| `Goylord-Server/src/server/routes/build-routes.ts` | 563-581 | `GET /api/build/plugins` endpoint |

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `Goylord-Server/public/assets/build.js` | 367-452 | `renderBuildPlugins()` — plugin cards UI |
| `Goylord-Server/public/assets/build.js` | 304-365 | `renderBuildPluginSetting()` — individual setting inputs |
| `Goylord-Server/public/assets/build.js` | 454-484 | `loadBuildPlugins()` — fetch from API, render |
| `Goylord-Server/public/assets/build.js` | 193-219 | `collectBuildPluginSettings()` — gather form values |
| `Goylord-Server/public/build.html` | 1125-1140 | `#build-plugins-section` HTML |

### Manifest Loading

| File | Lines | Purpose |
|------|-------|---------|
| `Goylord-Server/src/server/plugin-state-bundle.ts` | 267-298 | `listPluginManifests()` — discovers plugins, parses manifests |

---

## Security and RBAC

### Plugin Access Control

Build plugins use the same per-user plugin access policy as all other plugins. Admins can configure access from the Users page:

| Mode | Effect |
|------|--------|
| No Access | User cannot see or use build plugins |
| Selected Plugins | User can only use checked plugins |
| All Plugins | User can use every enabled plugin |

**Source:** `Goylord-Server/src/users.ts` — `canUserAccessPlugin()`

### Server-Side Enforcement

Even if a user edits the HTTP request to include a hidden plugin, the server validates plugin access (`Goylord-Server/src/server/routes/build-routes.ts:92-127`):

1. Loads all plugin manifests
2. For each plugin in the request, checks `canUserAccessPlugin()`
3. Rejects the build if any inaccessible plugin is included

### Trust Model

Server-side plugins run in the same process as the Goylord server. They have full filesystem and network access. Only install plugins you trust. Use plugin signing to verify integrity.

**Source:** `plugins/docs/signing.md`

---

## Troubleshooting

### Plugin doesn't appear in Build Plugins section

1. Check that `config.json` has a `"build"` object
2. Check that `runtime` is `"server"`
3. Check that the plugin is enabled in the Plugin Manager
4. Check server logs for Worker startup errors
5. Verify the zip contains `config.json` at the root

### Build fails with plugin error

1. Check the build output console for `[plugin:<id>]` messages
2. Check server logs for Worker crash reports
3. Verify the plugin's `onBuild*` functions return correctly

### Settings not appearing in UI

1. Check `config.json` → `build.settings` array format
2. Each setting needs `key`, `label`, and `type`
3. Verify `options` array for `select` type

### Artifact not replaced

1. Check that `onBuildArtifact` returns `{ file: { filename } }`
2. Verify the output file exists in `payload.outDir`
3. Check that the plugin is enabled in the build form
4. Look for `[plugin:<id>]` messages in build output

### Plugin crashes during build

Worker crashes are logged and the plugin's `lastError` is set. Disable and re-enable the plugin to restart the Worker. The build will fail if a plugin Worker crashes during hook execution.
