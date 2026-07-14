package plugins

type nativeEntryNames struct {
	onLoad      string
	onEvent     string
	onUnload    string
	setCallback string
	getRuntime  string
}

func nativeEntries(manifest PluginManifest) nativeEntryNames {
	names := nativeEntryNames{
		onLoad:      "PluginOnLoad",
		onEvent:     "PluginOnEvent",
		onUnload:    "PluginOnUnload",
		setCallback: "PluginSetCallback",
		getRuntime:  "PluginGetRuntime",
	}
	if manifest.NativeEntrypoints.OnLoad != "" {
		names.onLoad = manifest.NativeEntrypoints.OnLoad
	}
	if manifest.NativeEntrypoints.OnEvent != "" {
		names.onEvent = manifest.NativeEntrypoints.OnEvent
	}
	if manifest.NativeEntrypoints.OnUnload != "" {
		names.onUnload = manifest.NativeEntrypoints.OnUnload
	}
	if manifest.NativeEntrypoints.SetCallback != "" {
		names.setCallback = manifest.NativeEntrypoints.SetCallback
	}
	if manifest.NativeEntrypoints.GetRuntime != "" {
		names.getRuntime = manifest.NativeEntrypoints.GetRuntime
	}
	return names
}
