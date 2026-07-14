package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"time"
)

const crashLogFileName = "crashlogC.log"
const pendingCrashFileName = "last-crash.json"

type pendingCrashReport struct {
	At     string `json:"at"`
	Reason string `json:"reason"`
	Detail string `json:"detail,omitempty"`
	Log    string `json:"log,omitempty"`
}

func handleFatalPanic() {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if r := recover(); r != nil {
		reason := fmt.Sprintf("panic: %v", r)
		stack := debug.Stack()
		path := writeCrashLog(reason, stack)
		writePendingCrashReport("panic", reason, path)
		log.Printf("[fatal] %s (see %s)", reason, path)
		os.Exit(1)
	}
}

func fatalExit(reason string, err error) {
	if err != nil {
		reason = fmt.Sprintf("%s: %v", reason, err)
	}
	if reason == "" {
		reason = "fatal error"
	}
	stack := debug.Stack()
	path := writeCrashLog(reason, stack)
	writePendingCrashReport("fatal", reason, path)
	log.Printf("[fatal] %s (see %s)", reason, path)
	os.Exit(1)
}

func goSafe(label string, cancel context.CancelFunc, fn func()) {
	go func() {
		defer recoverAndLog(label, cancel)
		fn()
	}()
}

func recoverAndLog(label string, cancel context.CancelFunc) {
	if r := recover(); r != nil {
		reason := fmt.Sprintf("%s panic: %v", label, r)
		stack := debug.Stack()
		path := writeCrashLog(reason, stack)
		writePendingCrashReport("panic", reason, path)
		log.Printf("[panic] %s (see %s)", reason, path)
		if cancel != nil {
			cancel()
		}
	}
}

func writeCrashLog(reason string, stack []byte) string {
	dir := crashLogDir()
	_ = os.MkdirAll(dir, 0700)
	path := filepath.Join(dir, crashLogFileName)

	file, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Printf("[fatal] failed to open crash log %s: %v", path, err)
		return path
	}
	defer file.Close()

	timestamp := time.Now().UTC().Format(time.RFC3339)
	_, _ = fmt.Fprintf(file, "\n=== %s ===\n", timestamp)
	_, _ = fmt.Fprintf(file, "GOOS=%s GOARCH=%s\n", runtime.GOOS, runtime.GOARCH)
	_, _ = fmt.Fprintf(file, "Reason: %s\n", reason)
	if len(stack) > 0 {
		_, _ = fmt.Fprintf(file, "Stack:\n%s\n", string(stack))
	}

	return path
}

func crashLogDir() string {
	return os.TempDir()
}

func pendingCrashPath() string {
	return filepath.Join(crashLogDir(), pendingCrashFileName)
}

func writePendingCrashReport(reason, detail, logPath string) {
	report := pendingCrashReport{
		At:     time.Now().UTC().Format(time.RFC3339),
		Reason: reason,
		Detail: detail,
		Log:    logPath,
	}
	_ = os.MkdirAll(crashLogDir(), 0700)
	data, err := json.Marshal(report)
	if err != nil {
		return
	}
	_ = os.WriteFile(pendingCrashPath(), data, 0600)
}

func loadPendingCrashReport() (pendingCrashReport, bool) {
	data, err := os.ReadFile(pendingCrashPath())
	if err != nil {
		return pendingCrashReport{}, false
	}
	var report pendingCrashReport
	if json.Unmarshal(data, &report) != nil || report.Reason == "" {
		return pendingCrashReport{}, false
	}
	if report.Detail == "" && report.Log != "" {
		if f, err := os.Open(report.Log); err == nil {
			defer f.Close()
			buf, _ := io.ReadAll(io.LimitReader(f, 4096))
			report.Detail = string(buf)
		}
	}
	return report, true
}

func clearPendingCrashReport() {
	_ = os.Remove(pendingCrashPath())
}
