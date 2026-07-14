//go:build !windows

package runtime

import (
	"context"
	"os"
	"os/exec"
	"syscall"

	"github.com/creack/pty"
)

type unixPty struct {
	f   *os.File
	cmd *exec.Cmd
}

func (u *unixPty) Read(p []byte) (int, error)  { return u.f.Read(p) }
func (u *unixPty) Write(p []byte) (int, error) { return u.f.Write(p) }

func (u *unixPty) Close() error {
	if u.cmd != nil && u.cmd.Process != nil {
		_ = u.cmd.Process.Kill()
	}
	return u.f.Close()
}

func (u *unixPty) Resize(cols, rows uint16) error {
	return pty.Setsize(u.f, &pty.Winsize{Cols: cols, Rows: rows})
}

func (u *unixPty) Wait() (int, error) {
	if u.cmd == nil {
		return -1, nil
	}
	err := u.cmd.Wait()
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			if status, ok := ee.Sys().(syscall.WaitStatus); ok {
				return status.ExitStatus(), nil
			}
			return ee.ExitCode(), nil
		}
		return -1, err
	}
	return 0, nil
}

func startPty(ctx context.Context, shell []string, cols, rows uint16) (ptyHandle, error) {
	cmd := exec.CommandContext(ctx, shell[0], shell[1:]...)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")

	f, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		return nil, err
	}
	return &unixPty{f: f, cmd: cmd}, nil
}
