# Sample WASM Platform Note Plugin

This Plugin 2.0 sample is written in Rust. It reads HostInfo, branches on `os` and `arch`, writes a small note into the approved `pluginData` bucket, then lists the user's Desktop and attempts to read a small sample from one regular file to prove the file bridge is working.

The manifest requests `pluginData` write/mkdir access and `desktop` list/read access, so changing this sample's permissions will require approving the new needs hash before load.

On Windows, install the Rust WASI target first:

```bat
rustup target add wasm32-wasip1
```

Then run this sample's local `build.bat`. The builder runs Cargo, writes `sample-wasm-platform-note.wasm`, and creates `sample-wasm-platform-note.zip`.
