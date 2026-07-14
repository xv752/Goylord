//go:build windows

package runtime

import (
	"context"
	"io"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"syscall"

	"github.com/UserExistsError/conpty"
	"golang.org/x/sys/windows"
)

type winPty struct {
	cp     *conpty.ConPty
	waitCh chan waitResult
}

type waitResult struct {
	code int
	err  error
}

func (w *winPty) Read(p []byte) (int, error)  { return w.cp.Read(p) }
func (w *winPty) Write(p []byte) (int, error) { return w.cp.Write(p) }
func (w *winPty) Close() error                { return w.cp.Close() }

func (w *winPty) Resize(cols, rows uint16) error {
	return w.cp.Resize(int(cols), int(rows))
}

func (w *winPty) Wait() (int, error) {
	res := <-w.waitCh
	return res.code, res.err
}

type rawShell struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	reader io.ReadCloser
	writer *os.File
	once   sync.Once
	waitCh chan waitResult
}

func (r *rawShell) Read(p []byte) (int, error)  { return r.reader.Read(p) }
func (r *rawShell) Write(p []byte) (int, error) { return r.stdin.Write(p) }

func (r *rawShell) Close() error {
	r.once.Do(func() {
		r.stdin.Close()
		r.cmd.Process.Kill()
		r.writer.Close()
		r.reader.Close()
	})
	return nil
}

func (r *rawShell) Resize(cols, rows uint16) error { return nil }

func (r *rawShell) Wait() (int, error) {
	res := <-r.waitCh
	return res.code, res.err
}

func startRawShell(shell []string) (ptyHandle, error) {
	cmd := exec.Command(shell[0], shell[1:]...)
	cmd.SysProcAttr = &syscall.SysProcAttr{
		HideWindow:    true,
		CreationFlags: windows.CREATE_NO_WINDOW,
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}

	pr, pw, err := os.Pipe()
	if err != nil {
		stdin.Close()
		return nil, err
	}
	cmd.Stdout = pw
	cmd.Stderr = pw

	if err := cmd.Start(); err != nil {
		stdin.Close()
		pr.Close()
		pw.Close()
		return nil, err
	}

	rs := &rawShell{
		cmd:    cmd,
		stdin:  stdin,
		reader: pr,
		writer: pw,
		waitCh: make(chan waitResult, 1),
	}
	go func() {
		werr := cmd.Wait()
		pw.Close()
		code := 0
		if werr != nil {
			if exit, ok := werr.(*exec.ExitError); ok {
				code = exit.ExitCode()
			} else {
				code = 1
			}
		}
		rs.waitCh <- waitResult{code: code, err: werr}
	}()
	return rs, nil
}

func startPty(ctx context.Context, shell []string, cols, rows uint16) (ptyHandle, error) {
	cmdline := strings.Join(shell, " ")

	cp, err := conpty.Start(cmdline, conpty.ConPtyDimensions(int(cols), int(rows)))
	if err == nil {
		w := &winPty{cp: cp, waitCh: make(chan waitResult, 1)}
		go func() {
			code, werr := cp.Wait(context.Background())
			w.waitCh <- waitResult{code: int(code), err: werr}
		}()
		return w, nil
	}

	log.Printf("console: conpty failed (%v), falling back to raw shell", err)
	return startRawShell(shell)
}
