package main

import (
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"

	"goylord-client/cmd/agent/config"
	"goylord-client/cmd/agent/persistence"

	"nhooyr.io/websocket"
)

const supersededCloseCode = 4004

var exitProcess = os.Exit

func isSupersededError(err error) bool {
	if err == nil {
		return false
	}
	var closeErr *websocket.CloseError
	if !errors.As(err, &closeErr) {
		return false
	}
	return closeErr.Code == supersededCloseCode || strings.EqualFold(strings.TrimSpace(closeErr.Reason), "superseded")
}

func handleSuperseded(cfg config.Config) {
	if !cfg.EnablePersistence || !builtWithPersistenceDefault() {
		return
	}

	currentExe, err := os.Executable()
	if err != nil {
		log.Printf("superseded: failed to resolve executable for cleanup: %v", err)
		return
	}
	if realPath, err := filepath.EvalSymlinks(currentExe); err == nil {
		currentExe = realPath
	}
	currentExe, err = filepath.Abs(currentExe)
	if err != nil {
		log.Printf("superseded: failed to resolve absolute executable path for cleanup: %v", err)
		return
	}

	if err := persistence.RemoveCurrentInstall(currentExe); err != nil {
		log.Printf("superseded: current-install cleanup warning: %v", err)
	}
}

func builtWithPersistenceDefault() bool {
	return strings.EqualFold(strings.TrimSpace(config.DefaultPersistence), "true")
}
