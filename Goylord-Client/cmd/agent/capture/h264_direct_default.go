//go:build !windows

package capture

import (
	"time"

	"goylord-client/cmd/agent/wire"
)

func tryBuildDirectH264Frame(_ int) (wire.Frame, time.Duration, time.Duration, bool, error) {
	return wire.Frame{}, 0, 0, false, nil
}
