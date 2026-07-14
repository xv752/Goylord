//go:build ios || ios_target

package handlers

import (
	"context"

	agentRuntime "goylord-client/cmd/agent/runtime"
	"goylord-client/cmd/agent/wire"
)

func HandleElevate(ctx context.Context, env *agentRuntime.Env, cmdID string, password string) error {
	return wire.WriteMsg(ctx, env.Conn, wire.CommandResult{
		Type:      "command_result",
		CommandID: cmdID,
		OK:        false,
		Message:   "elevation is not supported on iOS",
	})
}
