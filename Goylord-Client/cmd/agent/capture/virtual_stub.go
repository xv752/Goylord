//go:build !windows

package capture

import (
	"errors"
	"image"
	"time"

	"goylord-client/cmd/agent/wire"
)

var errVirtualCaptureUnsupported = errors.New("virtual capture is only supported on Windows")

func InitializeVirtualMode() error {
	return nil
}

func CleanupVirtualMode() {}

func SetVirtualCursorCapture(enabled bool) {}

func VirtualMonitorCount() int {
	return 0
}

func VirtualTryDirectH264Frame() (wire.Frame, time.Duration, time.Duration, bool, error) {
	return wire.Frame{}, 0, 0, false, nil
}

func VirtualCaptureNormal() (*image.RGBA, error) {
	return nil, errVirtualCaptureUnsupported
}

func VirtualCaptureDisplay() (*image.RGBA, error) {
	return nil, errVirtualCaptureUnsupported
}

func VirtualCaptureGDI() (*image.RGBA, error) {
	return nil, errVirtualCaptureUnsupported
}

func VirtualCaptureDisplayFallback() (*image.RGBA, error) {
	return nil, errVirtualCaptureUnsupported
}

func VirtualResetDXGI() {}

func virtualCaptureDisplay() (*image.RGBA, error) {
	return nil, nil
}

func virtualCaptureDisplayFallback() (*image.RGBA, error) {
	return nil, nil
}

func StartVirtualProcess(filePath string) (uint32, error) {
	return 0, nil
}

func VirtualKillAll() error {
	return nil
}

func VirtualEnumWindows() ([]BackstageWindowInfo, []BackstageMonitorInfo) {
	return nil, nil
}

func VirtualInputMouseMove(x, y int32) error {
	return nil
}

func VirtualInputMouseDown(button int) error {
	return nil
}

func VirtualInputMouseUp(button int) error {
	return nil
}

func VirtualInputKeyDown(vk uint16) error {
	return nil
}

func VirtualInputKeyUp(vk uint16) error {
	return nil
}

func VirtualInputMouseWheel(delta int32) error {
	return nil
}
