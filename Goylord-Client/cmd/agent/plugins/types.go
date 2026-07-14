package plugins

import "errors"

type PluginAssets struct {
	HTML string `msgpack:"html" json:"html"`
	CSS  string `msgpack:"css" json:"css"`
	JS   string `msgpack:"js" json:"js"`
}

type PluginManifest struct {
	ID                string            `msgpack:"id" json:"id"`
	Name              string            `msgpack:"name" json:"name"`
	APIVersion        int               `msgpack:"apiVersion,omitempty" json:"apiVersion,omitempty"`
	RuntimeKind       string            `msgpack:"runtime,omitempty" json:"runtime,omitempty"`
	NativeLoader      string            `msgpack:"nativeLoader,omitempty" json:"nativeLoader,omitempty"`
	NativeEntrypoints NativeEntrypoints `msgpack:"nativeEntrypoints,omitempty" json:"nativeEntrypoints,omitempty"`
	Version           string            `msgpack:"version,omitempty" json:"version,omitempty"`
	Description       string            `msgpack:"description,omitempty" json:"description,omitempty"`
	Binary            string            `msgpack:"binary,omitempty" json:"binary,omitempty"`
	Binaries          map[string]string `msgpack:"binaries,omitempty" json:"binaries,omitempty"`
	WASM              string            `msgpack:"wasm,omitempty" json:"wasm,omitempty"`
	Needs             PluginNeeds       `msgpack:"needs,omitempty" json:"needs,omitempty"`
	Entry             string            `msgpack:"entry,omitempty" json:"entry,omitempty"`
	Assets            PluginAssets      `msgpack:"assets,omitempty" json:"assets,omitempty"`
}

type PluginNeeds struct {
	Files []PluginFileNeed `msgpack:"files,omitempty" json:"files,omitempty"`
}

type NativeEntrypoints struct {
	OnLoad      string `msgpack:"onLoad,omitempty" json:"onLoad,omitempty"`
	OnEvent     string `msgpack:"onEvent,omitempty" json:"onEvent,omitempty"`
	OnUnload    string `msgpack:"onUnload,omitempty" json:"onUnload,omitempty"`
	SetCallback string `msgpack:"setCallback,omitempty" json:"setCallback,omitempty"`
	GetRuntime  string `msgpack:"getRuntime,omitempty" json:"getRuntime,omitempty"`
}

type PluginFileNeed struct {
	Bucket string   `msgpack:"bucket" json:"bucket"`
	Access []string `msgpack:"access" json:"access"`
	Reason string   `msgpack:"reason,omitempty" json:"reason,omitempty"`
}

type PluginMessage struct {
	Type    string      `msgpack:"type"`
	Event   string      `msgpack:"event,omitempty"`
	Payload interface{} `msgpack:"payload,omitempty"`
	Error   string      `msgpack:"error,omitempty"`
}

type HostInfo struct {
	ClientID          string `msgpack:"clientId" json:"clientId"`
	OS                string `msgpack:"os" json:"os"`
	Arch              string `msgpack:"arch" json:"arch"`
	Version           string `msgpack:"version" json:"version"`
	PID               int    `msgpack:"pid,omitempty" json:"pid,omitempty"`
	ExePath           string `msgpack:"exePath,omitempty" json:"exePath,omitempty"`
	ExeDir            string `msgpack:"exeDir,omitempty" json:"exeDir,omitempty"`
	ExeName           string `msgpack:"exeName,omitempty" json:"exeName,omitempty"`
	WorkingDir        string `msgpack:"workingDir,omitempty" json:"workingDir,omitempty"`
	PersistenceMethod string `msgpack:"persistenceMethod,omitempty" json:"persistenceMethod,omitempty"`
	UptimeSeconds     int64  `msgpack:"uptimeSeconds,omitempty" json:"uptimeSeconds,omitempty"`
	StartTime         int64  `msgpack:"startTime,omitempty" json:"startTime,omitempty"`
	Elevation         string `msgpack:"elevation,omitempty" json:"elevation,omitempty"`
	IsAdmin           bool   `msgpack:"isAdmin,omitempty" json:"isAdmin,omitempty"`
	CriticalProcess   bool   `msgpack:"criticalProcess,omitempty" json:"criticalProcess,omitempty"`
	InMemory          bool   `msgpack:"inMemory,omitempty" json:"inMemory,omitempty"`
	Mutex             string `msgpack:"mutex,omitempty" json:"mutex,omitempty"`
	SleepSeconds      int    `msgpack:"sleepSeconds,omitempty" json:"sleepSeconds,omitempty"`
	UserDomain        string `msgpack:"userDomain,omitempty" json:"userDomain,omitempty"`
	UserName          string `msgpack:"userName,omitempty" json:"userName,omitempty"`
	ParentProcessName string `msgpack:"parentProcessName,omitempty" json:"parentProcessName,omitempty"`
	Platform          string `msgpack:"platform,omitempty" json:"platform,omitempty"`
}

type PluginRuntime interface {
	Load(send func(event string, payload []byte), hostInfo []byte) error

	Event(event string, payload []byte) error

	Unload()

	Close() error

	Runtime() string
}

type NativePlugin = PluginRuntime

func ManifestFromMap(m map[string]interface{}) (PluginManifest, error) {
	manifest := PluginManifest{}
	manifest.ID = stringVal(m["id"])
	manifest.Name = stringVal(m["name"])
	manifest.APIVersion = intVal(m["apiVersion"])
	manifest.RuntimeKind = stringVal(m["runtime"])
	manifest.NativeLoader = stringVal(m["nativeLoader"])
	manifest.Version = stringVal(m["version"])
	manifest.Description = stringVal(m["description"])
	manifest.Binary = stringVal(m["binary"])
	manifest.WASM = stringVal(m["wasm"])
	manifest.Entry = stringVal(m["entry"])
	if entryRaw, ok := m["nativeEntrypoints"].(map[string]interface{}); ok {
		manifest.NativeEntrypoints = NativeEntrypoints{
			OnLoad:      stringVal(entryRaw["onLoad"]),
			OnEvent:     stringVal(entryRaw["onEvent"]),
			OnUnload:    stringVal(entryRaw["onUnload"]),
			SetCallback: stringVal(entryRaw["setCallback"]),
			GetRuntime:  stringVal(entryRaw["getRuntime"]),
		}
	}

	if binariesRaw, ok := m["binaries"].(map[string]interface{}); ok {
		manifest.Binaries = make(map[string]string, len(binariesRaw))
		for k, v := range binariesRaw {
			if s, ok := v.(string); ok {
				manifest.Binaries[k] = s
			}
		}
	}

	if assetsRaw, ok := m["assets"].(map[string]interface{}); ok {
		manifest.Assets = PluginAssets{
			HTML: stringVal(assetsRaw["html"]),
			CSS:  stringVal(assetsRaw["css"]),
			JS:   stringVal(assetsRaw["js"]),
		}
	}
	if needsRaw, ok := m["needs"].(map[string]interface{}); ok {
		if filesRaw, ok := needsRaw["files"].([]interface{}); ok {
			for _, item := range filesRaw {
				fileRaw, ok := item.(map[string]interface{})
				if !ok {
					continue
				}
				need := PluginFileNeed{Bucket: stringVal(fileRaw["bucket"]), Reason: stringVal(fileRaw["reason"])}
				if accessRaw, ok := fileRaw["access"].([]interface{}); ok {
					for _, v := range accessRaw {
						if s, ok := v.(string); ok && s != "" {
							need.Access = append(need.Access, s)
						}
					}
				}
				if need.Bucket != "" && len(need.Access) > 0 {
					manifest.Needs.Files = append(manifest.Needs.Files, need)
				}
			}
		}
	}

	if manifest.ID == "" {
		return PluginManifest{}, errors.New("missing plugin id")
	}
	if manifest.Name == "" {
		manifest.Name = manifest.ID
	}
	return manifest, nil
}

func stringVal(v interface{}) string {
	s, _ := v.(string)
	return s
}

func intVal(v interface{}) int {
	switch n := v.(type) {
	case int:
		return n
	case int8:
		return int(n)
	case int16:
		return int(n)
	case int32:
		return int(n)
	case int64:
		return int(n)
	case uint:
		return int(n)
	case uint8:
		return int(n)
	case uint16:
		return int(n)
	case uint32:
		return int(n)
	case uint64:
		return int(n)
	case float32:
		return int(n)
	case float64:
		return int(n)
	default:
		return 0
	}
}
