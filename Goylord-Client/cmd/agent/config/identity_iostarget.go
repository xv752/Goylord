//go:build ios || ios_target

package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

const iosMachineIDFile = "config/ios_machine_id"

func platformMachineID() string {
	data, err := os.ReadFile(iosMachineIDFile)
	if err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			return id
		}
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Printf("[identity] WARNING: failed to generate iOS machine ID: %v", err)
		return ""
	}
	id := hex.EncodeToString(b)

	if err := os.MkdirAll("config", 0700); err != nil {
		log.Printf("[identity] WARNING: failed to create config dir for iOS machine ID: %v", err)
		return id
	}
	if err := os.WriteFile(iosMachineIDFile, []byte(id), 0600); err != nil {
		log.Printf("[identity] WARNING: failed to persist iOS machine ID: %v", err)
	}
	return id
}
