//go:build linux && !amd64 && !arm64 && !arm

package plugins

// pluginHostBinary is empty on architectures without a compiled plugin host shim.
// The loader falls back to direct dlopen on these platforms.
var pluginHostBinary []byte
