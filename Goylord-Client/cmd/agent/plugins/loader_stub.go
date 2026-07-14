//go:build !linux && !(darwin && cgo) && !windows

package plugins

import "errors"

func loadNativePlugin(manifest PluginManifest, data []byte) (NativePlugin, error) {
	return nil, errors.New("native plugins not supported on this platform (requires linux, cgo on darwin, or windows)")
}
