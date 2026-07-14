//go:build linux

package capture

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"log"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/kbinani/screenshot"
)

var ErrNoDisplays = fmt.Errorf("no displays available")

var isWaylandSession = os.Getenv("XDG_SESSION_TYPE") == "wayland" || os.Getenv("WAYLAND_DISPLAY") != ""

var (
	x11Disabled       atomic.Bool
	x11BlackCount     atomic.Int64
	x11CheckOnce      sync.Once
	x11MaxBlackFrames int64 = 3

	grimOnce   sync.Once
	grimAvail  bool
)

func init() {
	if isWaylandSession {
		log.Printf("capture: Wayland session detected (XDG_SESSION_TYPE=%s WAYLAND_DISPLAY=%s)",
			os.Getenv("XDG_SESSION_TYPE"), os.Getenv("WAYLAND_DISPLAY"))
		grimOnce.Do(func() {
			if path, err := exec.LookPath("grim"); err == nil && path != "" {
				grimAvail = true
				log.Printf("capture: grim found at %s, will use as Wayland fallback", path)
			}
		})
	}
}

var activeDisplays = func() int {
	if !isWaylandSession && !x11Disabled.Load() {
		if n := x11DisplayCount(); n > 0 {
			return n
		}
	}
	if isWaylandSession {
		if grimAvail {
			return 1
		}
		return screenshotFallbackDisplayCount()
	}
	return screenshot.NumActiveDisplays()
}

var captureDisplayFn = func(display int) (*image.RGBA, error) {
	if isWaylandSession || x11Disabled.Load() {
		return captureViaLibraryOrGrim(display)
	}

	img, err := x11CaptureDisplay(display)
	if err != nil {
		log.Printf("x11 capture: error, falling back to screenshot library: %v", err)
		return captureViaLibraryOrGrim(display)
	}

	if isAllBlack(img) {
		n := x11BlackCount.Add(1)
		if n >= x11MaxBlackFrames {
			log.Printf("x11 capture: %d consecutive all-black frames, disabling X11 capture permanently", n)
			x11Disabled.Store(true)
			x11Reset()
			return captureViaLibraryOrGrim(display)
		}
		libImg, libErr := captureViaLibraryOrGrim(display)
		if libErr == nil && !isAllBlack(libImg) {
			log.Printf("x11 capture: X11 returned black but screenshot library works, disabling X11 capture")
			x11Disabled.Store(true)
			x11Reset()
			return libImg, nil
		}
		return img, nil
	}
	x11BlackCount.Store(0)
	return img, nil
}

func captureViaLibraryOrGrim(display int) (*image.RGBA, error) {
	img, err := captureViaLibrary(display)
	if err == nil {
		return img, nil
	}
	if grimAvail {
		log.Printf("capture: screenshot library failed (%v), trying grim", err)
		if grimImg, grimErr := captureViaGrim(); grimErr == nil {
			return grimImg, nil
		} else {
			log.Printf("capture: grim also failed: %v", grimErr)
		}
	}
	return nil, err
}

func captureViaLibrary(display int) (*image.RGBA, error) {
	n := screenshotFallbackDisplayCount()
	if n == 0 {
		return nil, ErrNoDisplays
	}
	if display < 0 || display >= n {
		display = 0
	}
	bounds := screenshot.GetDisplayBounds(display)
	img, err := screenshot.CaptureRect(bounds)
	if err != nil {
		return nil, err
	}
	if img.Rect.Min.X != 0 || img.Rect.Min.Y != 0 {
		img.Rect = image.Rect(0, 0, img.Rect.Dx(), img.Rect.Dy())
	}
	return img, nil
}

func captureViaGrim() (*image.RGBA, error) {
	cmd := exec.Command("grim", "-t", "png")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("grim: %w: %s", err, strings.TrimSpace(stderr.String()))
	}
	if stdout.Len() == 0 {
		return nil, fmt.Errorf("grim: no output")
	}
	img, err := png.Decode(bytes.NewReader(stdout.Bytes()))
	if err != nil {
		return nil, fmt.Errorf("grim: decode png: %w", err)
	}
	bounds := img.Bounds()
	rgba := image.NewRGBA(image.Rect(0, 0, bounds.Dx(), bounds.Dy()))
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			rgba.Set(x-bounds.Min.X, y-bounds.Min.Y, img.At(x, y))
		}
	}
	return rgba, nil
}

func screenshotFallbackDisplayCount() int {
	defer func() {
		_ = recover()
	}()
	return screenshot.NumActiveDisplays()
}

func isAllBlack(img *image.RGBA) bool {
	if img == nil {
		return true
	}
	pix := img.Pix
	stride := img.Stride
	w := img.Rect.Dx()
	h := img.Rect.Dy()
	if w == 0 || h == 0 {
		return true
	}
	stepX := w / 4
	stepY := h / 4
	if stepX < 1 {
		stepX = 1
	}
	if stepY < 1 {
		stepY = 1
	}
	for y := stepY / 2; y < h; y += stepY {
		row := y * stride
		for x := stepX / 2; x < w; x += stepX {
			off := row + x*4
			if off+2 >= len(pix) {
				continue
			}
			if pix[off] != 0 || pix[off+1] != 0 || pix[off+2] != 0 {
				return false
			}
		}
	}
	return true
}

func displayCount() int {
	return activeDisplays()
}
