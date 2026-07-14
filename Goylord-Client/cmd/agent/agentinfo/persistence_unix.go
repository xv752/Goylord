//go:build !windows

package agentinfo

import (
	"os"
	"path/filepath"
	"strings"
)

func detectWindowsPersistence() string {
	return ""
}

func detectDarwinPersistence() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeLower := strings.ToLower(exePath)

	if strings.Contains(exeLower, "library/launchagents") {
		return "launchagent"
	}
	if strings.Contains(exeLower, "library/launchdaemons") {
		return "launchdaemon"
	}
	if strings.Contains(exeLower, "/tmp/") || strings.Contains(exeLower, "/var/tmp/") {
		return "temp"
	}
	return "standalone"
}

func detectLinuxPersistence() string {
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeLower := strings.ToLower(exePath)

	if strings.Contains(exeLower, "/etc/systemd/") {
		return "systemd"
	}
	if strings.Contains(exeLower, "/etc/init.d/") {
		return "initd"
	}
	if strings.Contains(exeLower, "/etc/cron") {
		return "cron"
	}
	if strings.Contains(exeLower, "/tmp/") {
		return "temp"
	}

	for _, dir := range []string{"/etc/systemd/system", "/etc/init.d", filepath.Join(os.Getenv("HOME"), ".config/systemd/user")} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		baseName := filepath.Base(exePath)
		for _, e := range entries {
			if strings.Contains(strings.ToLower(e.Name()), baseName) || strings.Contains(strings.ToLower(e.Name()), "goylord") || strings.Contains(strings.ToLower(e.Name()), "ovd_") {
				return "systemd"
			}
		}
	}

	return "standalone"
}
