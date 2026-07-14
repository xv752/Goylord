//go:build !windows

package agentinfo

import "os/exec"

func hideCmdWindow(_ *exec.Cmd) {}
