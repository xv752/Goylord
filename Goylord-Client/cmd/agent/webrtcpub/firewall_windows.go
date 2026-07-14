//go:build windows && goylord_webrtc

package webrtcpub

import (
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"

	"golang.org/x/sys/windows"
)

const createNoWindowFlag = 0x08000000

var firewallOnce sync.Once

func ensureFirewallRule() {
	firewallOnce.Do(func() {
		if !windows.GetCurrentProcessToken().IsElevated() {
			return
		}
		exe, err := os.Executable()
		if err != nil {
			return
		}
		if resolved, err := filepath.EvalSymlinks(exe); err == nil {
			exe = resolved
		}

		ruleName := filepath.Base(exe)
		hidden := &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindowFlag}

		del := exec.Command("netsh", "advfirewall", "firewall", "delete", "rule",
			"name="+ruleName, "program="+exe)
		del.SysProcAttr = hidden
		_ = del.Run()

		add := exec.Command("netsh", "advfirewall", "firewall", "add", "rule",
			"name="+ruleName, "dir=in", "action=allow", "program="+exe, "enable=yes")
		add.SysProcAttr = hidden
		if err := add.Run(); err != nil {
			log.Printf("webrtcpub: firewall rule add failed: %v", err)
		}
	})
}
