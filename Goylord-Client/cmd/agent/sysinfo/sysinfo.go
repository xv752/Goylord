package sysinfo

type Info struct {
	CPU             string `json:"cpu,omitempty"`
	GPU             string `json:"gpu,omitempty"`
	RAM             string `json:"ram,omitempty"`
	StorageTotalGB  string `json:"storageTotalGb,omitempty"`
	OSFamily        string `json:"osFamily,omitempty"`
	OSDistro        string `json:"osDistro,omitempty"`
	OSVersion       string `json:"osVersion,omitempty"`
	BatteryPercent  *int   `json:"batteryPercent,omitempty"`
	BatteryCharging bool   `json:"batteryCharging,omitempty"`
}

var CollectCPU = true
var CollectGPU = true
var CollectRAM = true
var CollectStorage = true

func Collect() Info {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	return collectPlatform()
}
