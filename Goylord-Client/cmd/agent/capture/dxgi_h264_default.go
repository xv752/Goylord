//go:build !windows

package capture

import "time"

func captureDisplayDXGIH264(_ int, _ bool) ([]byte, int, int, time.Duration, time.Duration, bool, error) {
	return nil, 0, 0, 0, 0, false, nil
}
