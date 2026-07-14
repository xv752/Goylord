//go:build linux && arm

package plugins

import _ "embed"

//go:embed plugin_host/plugin_host_arm
var pluginHostBinary []byte
