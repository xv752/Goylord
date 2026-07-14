//go:build darwin && !ios && !ios_target

package sysinfo

import (
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

func IsAdmin() bool {
	return os.Getuid() == 0
}

func Elevation() string {
	if os.Getuid() == 0 {
		return "admin"
	}
	return ""
}

func DarwinPermissions() map[string]bool {
	return map[string]bool{
		"screenRecording": darwinScreenRecordingPermission(),
		"accessibility":   darwinAccessibilityPermission(),
		"inputMonitoring": darwinInputMonitoringPermission(),
		"fullDiskAccess":  darwinFullDiskAccessPermission(),
		"root":            os.Getuid() == 0,
	}
}

func DarwinPermissionsRefresh() map[string]bool {
	return map[string]bool{
		"screenRecording": darwinScreenRecordingPermission(),
		"accessibility":   darwinAccessibilityPermission(),
		"fullDiskAccess":  darwinFullDiskAccessPermission(),
		"root":            os.Getuid() == 0,
	}
}

func RequestDarwinPermissions(requested []string) map[string]bool {
	want := make(map[string]bool, len(requested))
	for _, key := range requested {
		want[key] = true
	}
	if len(want) == 0 {
		want["accessibility"] = true
		want["screenRecording"] = true
		want["inputMonitoring"] = true
		want["fullDiskAccess"] = true
	}

	if want["accessibility"] {
		darwinRequestAccessibilityPermission()
	}
	if want["screenRecording"] {
		darwinRequestScreenRecordingPermission()
	}
	if want["inputMonitoring"] {
		darwinRequestInputMonitoringPermission()
		_ = exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent").Start()
	}
	if want["fullDiskAccess"] {
		_ = exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles").Start()
	}

	return DarwinPermissions()
}

func darwinFullDiskAccessPermission() bool {
	home, _ := os.UserHomeDir()
	candidates := []string{
		"/Library/Application Support/com.apple.TCC/TCC.db",
	}
	if home != "" {
		candidates = append(candidates,
			filepath.Join(home, "Library", "Mail"),
			filepath.Join(home, "Library", "Messages"),
			filepath.Join(home, "Library", "Safari"),
			filepath.Join(home, "Library", "Calendars"),
			filepath.Join(home, "Library", "Application Support", "AddressBook"),
		)
	}

	for _, path := range candidates {
		if canOpenProtectedPath(path) {
			return true
		}
	}
	return false
}

func canOpenProtectedPath(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	info, err := f.Stat()
	if err != nil {
		return false
	}
	if !info.IsDir() {
		return true
	}
	_, err = f.Readdirnames(1)
	return err == nil || errors.Is(err, io.EOF)
}
