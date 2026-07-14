//go:build !windows && !linux && !darwin && !nokeylogger
// Catch-all stub for platforms without a native keylogger implementation
// (FreeBSD, OpenBSD, Android, etc.).
//
// Darwin is excluded because it has its own implementations:
//   - keylogger_darwin.go      (darwin && cgo)    — CGEventTap, full capture
//   - keylogger_darwin_nocgo.go (darwin && !cgo)  — osascript permission gate,
//                                                   stub capture

package keylogger

import (
	"fmt"
	"log"
	"runtime"
	"time"
)

func (k *Keylogger) captureKeystrokes() error {
	log.Printf("[keylogger] keylogging is not implemented on %s - placeholder mode", runtime.GOOS)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-k.stopCh:
			return nil
		case <-ticker.C:
			k.logKey(fmt.Sprintf("[System Activity Detected at %s]", time.Now().Format("15:04:05")))
		}
	}
}

func getWindowTitle() string {
	return ""
}
