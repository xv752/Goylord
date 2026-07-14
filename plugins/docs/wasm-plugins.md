# WASM Plugins

Plugin 2.0 WASM plugins run inside the agent through a sandboxed runtime. They cannot access files or OS APIs directly; they declare needs in `config.json`, and the agent exposes approved host bridge operations.

## Config

```json
{
  "name": "My WASM Plugin",
  "version": "1.0.0",
  "apiVersion": 2,
  "runtime": "wasm",
  "wasm": "my-plugin.wasm",
  "needs": {
    "files": [
      {
        "bucket": "pluginData",
        "access": ["read", "write", "list", "mkdir"],
        "reason": "Store plugin state"
      }
    ]
  }
}
```

Supported file buckets are `home`, `desktop`, `documents`, `downloads`, `temp`, `appData`, `pluginData`, and `fullDisk`.

Supported operations are `read`, `write`, `list`, `delete`, and `mkdir`. Approval is tracked by a stable hash of normalized needs; changing needs requires approval again.

## Required Exports

| Export | Signature |
|--------|-----------|
| `goylord_alloc` | `ptr(uint32 size)` |
| `goylord_free` | `void(ptr, uint32 size)` |
| `goylord_on_load` | `int32(ptr hostInfo, uint32 hostInfoLen)` |
| `goylord_on_event` | `int32(ptr event, uint32 eventLen, ptr payload, uint32 payloadLen)` |
| `goylord_on_unload` | `void()` |

## Host Imports

Imports are available from both `env` and `goylord`.

| Import | Behavior |
|--------|----------|
| `goylord_emit(event, eventLen, payload, payloadLen)` | Sends an event through the plugin event channel. |
| `goylord_host_info(out, outLen)` | Writes HostInfo JSON into `out`. |
| `goylord_fs_stat(bucket, bucketLen, path, pathLen, out, outLen)` | Writes JSON file metadata into `out`. |
| `goylord_fs_list(bucket, bucketLen, path, pathLen, out, outLen)` | Writes a JSON directory listing into `out`. |
| `goylord_fs_read(bucket, bucketLen, path, pathLen, out, outLen)` | Writes file bytes into `out`, max 32 MB. |
| `goylord_fs_write(bucket, bucketLen, path, pathLen, data, dataLen)` | Writes bytes to a bucket-relative path. |
| `goylord_fs_delete(bucket, bucketLen, path, pathLen)` | Deletes a bucket-relative file or directory. |
| `goylord_fs_mkdir(bucket, bucketLen, path, pathLen)` | Creates a bucket-relative directory. |

Bridge functions return non-negative byte counts or `0` on success. Negative return codes mean denied, invalid path/memory, not found, output buffer too small, file too large, or I/O failure.

## HostInfo

WASM plugins are universal across OS/architecture. To branch by platform, read HostInfo from `goylord_on_load(hostInfo, hostInfoLen)` or `goylord_host_info(out, outLen)`.

```json
{
  "clientId": "abc123",
  "os": "windows",
  "arch": "amd64",
  "version": "1.0.0"
}
```

## Samples

| Directory | Toolchain |
|-----------|-----------|
| `plugins/sample-wasm` | C/WASI |
| `plugins/sample-wasm-hostinfo` | TinyGo |
| `plugins/sample-wasm-platform-note` | Rust |
