//go:build windows && !no_nvenc

package capture

import (
	"fmt"
	"syscall"
	"unsafe"
)

type NVENCSmokeResult struct {
	Available bool   `json:"available"`
	DLL       string `json:"dll"`
	APIMajor  int    `json:"api_major"`
	APIMinor  int    `json:"api_minor"`
	RawAPI    uint32 `json:"raw_api"`
	Error     string `json:"error,omitempty"`
}

func RunNVENCSmoke() NVENCSmokeResult {
	result := NVENCSmokeResult{DLL: "nvEncodeAPI64.dll"}
	dll := syscall.NewLazyDLL(result.DLL)
	proc := dll.NewProc("NvEncodeAPIGetMaxSupportedVersion")
	if err := dll.Load(); err != nil {
		result.Error = err.Error()
		return result
	}
	if err := proc.Find(); err != nil {
		result.Error = err.Error()
		return result
	}

	var raw uint32
	status, _, _ := proc.Call(uintptr(unsafe.Pointer(&raw)))
	if status != 0 {
		result.Error = fmt.Sprintf("NvEncodeAPIGetMaxSupportedVersion failed status=%d", status)
		return result
	}
	result.Available = true
	result.RawAPI = raw
	result.APIMajor = int(raw >> 4)
	result.APIMinor = int(raw & 0xf)
	return result
}
