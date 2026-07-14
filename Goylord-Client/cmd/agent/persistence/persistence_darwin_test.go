//go:build darwin && !ios && !ios_target

package persistence

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func withDarwinTempHome(t *testing.T) string {
	t.Helper()

	home := t.TempDir()
	origHome := currentUserHomeDir
	origStartupName := DefaultStartupName
	currentUserHomeDir = func() (string, error) { return home, nil }
	DefaultStartupName = ""

	t.Cleanup(func() {
		currentUserHomeDir = origHome
		DefaultStartupName = origStartupName
	})

	return home
}

func writeDarwinSourceExecutable(t *testing.T) string {
	t.Helper()

	src := filepath.Join(t.TempDir(), "source-agent")
	if err := os.WriteFile(src, []byte("agent-bytes"), 0644); err != nil {
		t.Fatalf("write source executable: %v", err)
	}
	return src
}

func TestDarwinInstallCreatesLaunchAgentAndExecutable(t *testing.T) {
	home := withDarwinTempHome(t)
	src := writeDarwinSourceExecutable(t)

	if err := InstallFrom(src); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, "Library", "Application Support", "Goylord", "agent")
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

	plistPath := filepath.Join(home, "Library", "LaunchAgents", "com.goylord.agent.plist")
	plistBytes, err := os.ReadFile(plistPath)
	if err != nil {
		t.Fatalf("read launch agent plist: %v", err)
	}
	plist := string(plistBytes)
	for _, want := range []string{
		"<string>com.goylord.agent</string>",
		"<key>ProgramArguments</key>",
		"<string>" + target + "</string>",
		"<key>RunAtLoad</key>",
		"<key>KeepAlive</key>",
	} {
		if !strings.Contains(plist, want) {
			t.Fatalf("launch agent plist missing %q:\n%s", want, plist)
		}
	}
}

func TestDarwinConfigureCreatesLaunchAgentForExistingPath(t *testing.T) {
	home := withDarwinTempHome(t)
	exePath := filepath.Join(home, "bin", "existing-agent")

	if err := Configure(exePath); err != nil {
		t.Fatalf("Configure() error: %v", err)
	}

	plistPath := filepath.Join(home, "Library", "LaunchAgents", "com.goylord.agent.plist")
	plistBytes, err := os.ReadFile(plistPath)
	if err != nil {
		t.Fatalf("read launch agent plist: %v", err)
	}
	if plist := string(plistBytes); !strings.Contains(plist, "<string>"+exePath+"</string>") {
		t.Fatalf("launch agent plist missing executable path %q:\n%s", exePath, plist)
	}
}

func TestDarwinCustomStartupNameRequiresLaunchAgentLabel(t *testing.T) {
	home := withDarwinTempHome(t)
	DefaultStartupName = "updater"

	if err := InstallFrom(writeDarwinSourceExecutable(t)); err == nil {
		t.Fatal("InstallFrom() error = nil, want invalid startup name error")
	}
	if err := Configure(filepath.Join(home, "bin", "updater")); err == nil {
		t.Fatal("Configure() error = nil, want invalid startup name error")
	}
	if _, err := TargetPath(); err == nil {
		t.Fatal("TargetPath() error = nil, want invalid startup name error")
	}
}

func TestDarwinCustomStartupNameCreatesCustomLabelAndBinary(t *testing.T) {
	home := withDarwinTempHome(t)
	DefaultStartupName = "com.example.updater"

	if err := InstallFrom(writeDarwinSourceExecutable(t)); err != nil {
		t.Fatalf("InstallFrom() error: %v", err)
	}

	target := filepath.Join(home, "Library", "Application Support", "Goylord", "com.example.updater")
	if _, err := os.Stat(target); err != nil {
		t.Fatalf("stat custom executable: %v", err)
	}

	plistPath := filepath.Join(home, "Library", "LaunchAgents", "com.example.updater.plist")
	plistBytes, err := os.ReadFile(plistPath)
	if err != nil {
		t.Fatalf("read custom launch agent plist: %v", err)
	}
	plist := string(plistBytes)
	if !strings.Contains(plist, "<string>com.example.updater</string>") {
		t.Fatalf("custom launch agent plist missing label:\n%s", plist)
	}
	if !strings.Contains(plist, "<string>"+target+"</string>") {
		t.Fatalf("custom launch agent plist missing target %q:\n%s", target, plist)
	}
}

func TestDarwinReplaceExecutablePreservesExecutableModeWhenTargetExists(t *testing.T) {
	_ = withDarwinTempHome(t)
	src := writeDarwinSourceExecutable(t)
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
