//go:build !windows || !goylord_winre
// +build !windows !goylord_winre

package handlers

import (
	"context"
	"fmt"

	"goylord-client/cmd/agent/runtime"
)

func handleWinREInstall(ctx context.Context, env *runtime.Env, cmdID string, filePath string, useSelf bool) error {
	return fmt.Errorf("WinRE persistence is not enabled on this client")
}

func handleWinREUninstall(ctx context.Context, env *runtime.Env, cmdID string) error {
	return fmt.Errorf("WinRE persistence is not enabled on this client")
}

func WinRESupported() bool {
	return false
}
