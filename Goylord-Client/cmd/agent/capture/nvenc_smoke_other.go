//go:build !windows || no_nvenc

package capture

type NVENCSmokeResult struct {
	Available bool   `json:"available"`
	DLL       string `json:"dll"`
	APIMajor  int    `json:"api_major"`
	APIMinor  int    `json:"api_minor"`
	RawAPI    uint32 `json:"raw_api"`
	Error     string `json:"error,omitempty"`
}

func RunNVENCSmoke() NVENCSmokeResult {
	return NVENCSmokeResult{DLL: "nvEncodeAPI64.dll", Error: "NVENC smoke is only supported on Windows"}
}
