package runtime

import (
	"context"
	"fmt"
	"io"
	"os"
	"runtime"
	"sync"

	"goylord-client/cmd/agent/wire"
)

type ConsoleHub struct {
	env      *Env
	mu       sync.Mutex
	sessions map[string]*ConsoleSession
}

type ConsoleSession struct {
	id     string
	pty    ptyHandle
	cancel context.CancelFunc
	once   sync.Once
}

type ConsoleStartRequest struct {
	SessionID string
	Cols      int
	Rows      int
}

type ptyHandle interface {
	io.ReadWriteCloser
	Resize(cols, rows uint16) error
	Wait() (int, error)
}

func NewConsoleHub(env *Env) *ConsoleHub {
	return &ConsoleHub{env: env, sessions: make(map[string]*ConsoleSession)}
}

func (h *ConsoleHub) Start(ctx context.Context, req ConsoleStartRequest) error {
	if req.SessionID == "" {
		return fmt.Errorf("missing session id")
	}

	cols := uint16(req.Cols)
	rows := uint16(req.Rows)
	if cols == 0 {
		cols = 120
	}
	if rows == 0 {
		rows = 36
	}

	h.mu.Lock()
	if existing, ok := h.sessions[req.SessionID]; ok {
		existing.close()
		delete(h.sessions, req.SessionID)
	}
	h.mu.Unlock()

	shell := detectShell()
	sessionCtx, cancel := context.WithCancel(ctx)
	handle, err := startPty(sessionCtx, shell, cols, rows)
	if err != nil {
		cancel()
		h.emitError(req.SessionID, err)
		return err
	}

	sess := &ConsoleSession{id: req.SessionID, pty: handle, cancel: cancel}
	h.mu.Lock()
	h.sessions[req.SessionID] = sess
	h.mu.Unlock()

	go h.forwardOutput(sess)
	return nil
}

func (h *ConsoleHub) Write(ctx context.Context, sessionID string, data string) error {
	sess := h.get(sessionID)
	if sess == nil {
		return fmt.Errorf("session not found")
	}
	_, err := sess.pty.Write([]byte(data))
	return err
}

func (h *ConsoleHub) Resize(sessionID string, cols, rows int) error {
	sess := h.get(sessionID)
	if sess == nil {
		return fmt.Errorf("session not found")
	}
	if cols <= 0 {
		cols = 120
	}
	if rows <= 0 {
		rows = 36
	}
	return sess.pty.Resize(uint16(cols), uint16(rows))
}

func (h *ConsoleHub) Stop(sessionID string) {
	h.mu.Lock()
	sess := h.sessions[sessionID]
	delete(h.sessions, sessionID)
	h.mu.Unlock()
	if sess != nil {
		sess.close()
	}
}

func (h *ConsoleHub) StopAll() {
	if h == nil {
		return
	}
	h.mu.Lock()
	ids := make([]string, 0, len(h.sessions))
	for id := range h.sessions {
		ids = append(ids, id)
	}
	h.mu.Unlock()
	for _, id := range ids {
		h.Stop(id)
	}
}

func (h *ConsoleHub) forwardOutput(sess *ConsoleSession) {
	writeCtx := context.Background()

	buf := make([]byte, 4096)
	for {
		n, err := sess.pty.Read(buf)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buf[:n])
			_ = wire.WriteMsg(writeCtx, h.env.Conn, wire.ConsoleOutput{Type: "console_output", SessionID: sess.id, Data: chunk})
		}
		if err != nil {
			if err != io.EOF {
				h.emitError(sess.id, err)
			}
			break
		}
	}

	exitCode, _ := sess.pty.Wait()
	_ = wire.WriteMsg(writeCtx, h.env.Conn, wire.ConsoleOutput{Type: "console_output", SessionID: sess.id, ExitCode: &exitCode})

	h.mu.Lock()
	delete(h.sessions, sess.id)
	h.mu.Unlock()
	sess.close()
}

func (h *ConsoleHub) emitError(sessionID string, err error) {
	_ = wire.WriteMsg(context.Background(), h.env.Conn, wire.ConsoleOutput{Type: "console_output", SessionID: sessionID, Error: err.Error()})
}

func (h *ConsoleHub) get(sessionID string) *ConsoleSession {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.sessions[sessionID]
}

func (sess *ConsoleSession) close() {
	sess.once.Do(func() {
		if sess.cancel != nil {
			sess.cancel()
		}
		if sess.pty != nil {
			_ = sess.pty.Close()
		}
	})
}

func detectShell() []string {
	if runtime.GOOS == "windows" {
		if c := os.Getenv("COMSPEC"); c != "" {
			return []string{c}
		}
		return []string{"cmd.exe"}
	}
	if sh := os.Getenv("SHELL"); sh != "" {
		return []string{sh, "-l"}
	}
	if runtime.GOOS == "darwin" {
		return []string{"/bin/zsh", "-l"}
	}
	return []string{"/bin/bash", "-l"}
}
