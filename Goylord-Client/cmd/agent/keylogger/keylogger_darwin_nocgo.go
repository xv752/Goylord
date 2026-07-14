//go:build darwin && !nokeylogger && !cgo
// +build darwin,!nokeylogger,!cgo

package keylogger

import (
	"log"
	"os/exec"
	"strings"
	"time"
)

func checkPermissionViaOsascript() bool {
	cmd := exec.Command("osascript", "-e",
		`tell application "System Events" to return name of every process`)
	cmd.Stdout = nil
	out, err := cmd.Output()
	if err != nil {
		return false
	}
	return len(strings.TrimSpace(string(out))) > 0
}

func requestPermissionViaOsascript() bool {
	cmd := exec.Command("osascript", "-e",
		`tell application "System Events" to return name of every process`)
	cmd.Run() // ignore error — the prompt fires as a side effect

	deadline := time.Now().Add(60 * time.Second)
	for time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
		if checkPermissionViaOsascript() {
			return true
		}
	}
	return false
}

func (k *Keylogger) NeedsPermissionGate() bool {
	return true
}

func (k *Keylogger) RequestPermission() bool {
	granted := requestPermissionViaOsascript()
	k.mu.Lock()
	k.permissionGranted = granted
	k.mu.Unlock()
	return granted
}

func (k *Keylogger) HasPermission() bool {
	return checkPermissionViaOsascript()
}

func (k *Keylogger) captureKeystrokes() error {
	log.Printf("[keylogger] keystroke capture is not available in CGO-disabled darwin builds; rebuild natively on macOS")
	<-k.stopCh
	return nil
}

func getWindowTitle() string {
	return ""
}
