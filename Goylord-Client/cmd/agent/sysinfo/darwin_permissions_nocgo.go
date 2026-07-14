//go:build darwin && !cgo

package sysinfo

func darwinAccessibilityPermission() bool {
	return false
}

func darwinScreenRecordingPermission() bool {
	return false
}

func darwinInputMonitoringPermission() bool {
	return false
}

func darwinRequestAccessibilityPermission() bool {
	return false
}

func darwinRequestScreenRecordingPermission() bool {
	return false
}

func darwinRequestInputMonitoringPermission() bool {
	return false
}
