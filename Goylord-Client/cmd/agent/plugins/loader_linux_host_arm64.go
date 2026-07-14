//go:build linux && arm64

package plugins

import _ "embed"

//go:embed plugin_host/plugin_host_arm64
var pluginHostBinary []byte
