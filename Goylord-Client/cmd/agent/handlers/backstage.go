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
	backstagePersistedDisplayValue int
	backstagePersistedDisplayMu    sync.Mutex
	backstageTargetFPS             atomic.Int64
)

func persistbackstageDisplaySelection(display int) {
	backstagePersistedDisplayMu.Lock()
	backstagePersistedDisplayValue = display
	backstagePersistedDisplayMu.Unlock()
}

func GetPersistedbackstageDisplay() int {
	backstagePersistedDisplayMu.Lock()
	defer backstagePersistedDisplayMu.Unlock()
	return backstagePersistedDisplayValue
}

func backstageStart(ctx context.Context, env *rt.Env, autoStartExplorer bool) error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	fps := activebackstageTargetFPS()
	interval := time.Second / time.Duration(fps)
	capture.SetH264TargetFPS(fps)
	capture.SetFrameFlowTargetFPS(fps)
	log.Printf("backstage: starting stream (target fps %d)", fps)

	if err := capture.InitializebackstageDesktop(); err != nil {
		log.Printf("backstage: failed to initialize hidden desktop: %v", err)
		return err
	}

	if autoStartExplorer {
		goSafe("backstage auto-start explorer", nil, func() {
			if err := capture.BackstageAutoStartExplorer(); err != nil {
				log.Printf("backstage: auto-start explorer error: %v", err)
			}
		})
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	currentFPS := fps
	for {
		select {
		case <-ctx.Done():
			log.Printf("backstage: stopping stream")
			capture.CleanupbackstageDesktop()
			return nil
		case <-ticker.C:
			fps := activebackstageTargetFPS()
			if fps != currentFPS {
				currentFPS = fps
				capture.SetH264TargetFPS(fps)
				capture.SetFrameFlowTargetFPS(fps)
				ticker.Reset(time.Second / time.Duration(fps))
				log.Printf("backstage: target fps changed to %d", fps)
			}
			if err := capture.Nowbackstage(ctx, env); err != nil {
				if ctx.Err() != nil {
					log.Printf("backstage: stopping stream")
					capture.CleanupbackstageDesktop()
					return nil
				}
				log.Printf("backstage: capture error: %v", err)
			}
		}
	}
}

func activebackstageTargetFPS() int {
	if fps := int(backstageTargetFPS.Load()); fps > 0 {
		return fps
	}
	_, fps := streamInterval("GOYLORD_backstage_MAX_FPS", 120)
	return SetbackstageTargetFPS(fps)
}

func SetbackstageTargetFPS(fps int) int {
	fps = clampDesktopTargetFPS(fps)
	backstageTargetFPS.Store(int64(fps))
	capture.SetH264TargetFPS(fps)
	capture.SetFrameFlowTargetFPS(fps)
	return fps
}

func backstageSelect(ctx context.Context, env *rt.Env, display int) error {
	env.BackstageMu.Lock()
	prev := env.BackstageSelectedDisplay
	env.BackstageMu.Unlock()
	maxDisplays := capture.BackstageMonitorCount()
	if display < 0 || display >= maxDisplays {
		log.Printf("backstage: WARNING - requested display %d out of range (0-%d), clamping to 0", display, maxDisplays-1)
		display = 0
	}
	env.BackstageMu.Lock()
	env.BackstageSelectedDisplay = display
	env.BackstageMu.Unlock()

	persistbackstageDisplaySelection(display)
	log.Printf("backstage: set selected display from %d to %d (reported monitors=%d, will capture monitor at index %d)", prev, display, maxDisplays, display)
	return nil
}

func backstageMouseControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.BackstageMu.Lock()
	env.BackstageMouseControl = enabled
	env.BackstageMu.Unlock()
	log.Printf("backstage: mouse control %v", enabled)
	return nil
}

func backstageKeyboardControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.BackstageMu.Lock()
	env.BackstageKeyboardControl = enabled
	env.BackstageMu.Unlock()
	log.Printf("backstage: keyboard control %v", enabled)
	return nil
}

func backstageCursorControl(ctx context.Context, env *rt.Env, enabled bool) error {
	env.BackstageMu.Lock()
	env.BackstageCursorCapture = enabled
	env.BackstageMu.Unlock()
	capture.SetbackstageCursorCapture(enabled)
	log.Printf("backstage: cursor capture %v", enabled)
	return nil
}
