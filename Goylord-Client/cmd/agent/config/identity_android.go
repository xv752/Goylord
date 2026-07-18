//go:build android

package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

const androidMachineIDFile = "android_machine_id"

func platformMachineID() string {
	idPath := ensureStateDir() + "/" + androidMachineIDFile
	data, err := os.ReadFile(idPath)
	if err == nil {
		if id := strings.TrimSpace(string(data)); id != "" {
			return id
		}
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Printf("[identity] WARNING: failed to generate android machine ID: %v", err)
		return ""
	}
	id := hex.EncodeToString(b)

	if err := os.WriteFile(idPath, []byte(id), 0600); err != nil {
		log.Printf("[identity] WARNING: failed to persist android machine ID: %v", err)
	}
	return id
}
