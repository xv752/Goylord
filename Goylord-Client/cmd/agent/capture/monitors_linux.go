//go:build linux

package capture

import (
	"image"
	"log"

	"github.com/kbinani/screenshot"
)

func displayBounds(idx int) image.Rectangle {
	if !isWaylandSession && !x11Disabled.Load() {
		if b := x11DisplayBounds(idx); b.Dx() > 0 && b.Dy() > 0 {
			return b
		}
	}
	n := safeScreenshotDisplayCount()
	if idx < 0 || idx >= n {
		if isWaylandSession && grimAvail && idx == 0 {
			return image.Rect(0, 0, 1920, 1080)
		}
		return image.Rectangle{}
	}
	return safeScreenshotDisplayBounds(idx)
}

func displayScale(idx int) float64 {
	return 1.0
}

func MonitorInfos() []MonitorInfo {
	n := displayCount()
	infos := make([]MonitorInfo, 0, n)
	for i := 0; i < n; i++ {
		b := displayBounds(i)
		if b.Dx() > 0 && b.Dy() > 0 {
			infos = append(infos, MonitorInfo{
				Width:  b.Dx(),
				Height: b.Dy(),
			})
		}
	}
	return infos
}

func safeScreenshotDisplayCount() int {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("capture: panic in screenshot display count (likely Wayland): %v", r)
		}
	}()
	return screenshot.NumActiveDisplays()
}

func safeScreenshotDisplayBounds(idx int) (rect image.Rectangle) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("capture: panic in screenshot display bounds %d (likely Wayland): %v", idx, r)
			rect = image.Rectangle{}
		}
	}()
	return screenshot.GetDisplayBounds(idx)
}
