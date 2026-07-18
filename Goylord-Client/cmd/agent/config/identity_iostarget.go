//go:build ios || ios_target

package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

const iosMachineIDFile = "ios_machine_id"

func platformMachineID() string {
	idPath := ensureStateDir() + "/" + iosMachineIDFile
	data, err := os.ReadFile(idPath)
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

	if err := os.WriteFile(idPath, []byte(id), 0600); err != nil {
		log.Printf("[identity] WARNING: failed to persist iOS machine ID: %v", err)
	}
	return id
}
