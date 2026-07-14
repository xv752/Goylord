//go:build !windows

package activewindow

import (
	"context"

	"goylord-client/cmd/agent/runtime"
)

func StartClipboard(_ context.Context, _ *runtime.Env) error {
	return nil
}
