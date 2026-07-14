//go:build noprint
// +build noprint

package main

import (
	"goylord-client/cmd/agent/config"
	"goylord-client/cmd/agent/securelog"
)

func init() {
	securelog.Install(config.DefaultSecureLogPublicKey)
}
