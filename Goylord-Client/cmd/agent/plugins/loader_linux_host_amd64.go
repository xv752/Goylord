//go:build linux && amd64

package plugins

import _ "embed"

//go:embed plugin_host/plugin_host_amd64
var pluginHostBinary []byte
