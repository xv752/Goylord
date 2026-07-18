//go:build linux && !android

package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

const instanceSeedFile = "instance_seed"

func getOrCreateInstanceSeed() string {
	seedPath := ensureStateDir() + "/" + instanceSeedFile
	data, err := os.ReadFile(seedPath)
	if err == nil {
		if seed := strings.TrimSpace(string(data)); seed != "" {
			return seed
		}
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Printf("[identity] WARNING: failed to generate instance seed: %v", err)
		return ""
	}
	seed := hex.EncodeToString(b)

	if err := os.WriteFile(seedPath, []byte(seed), 0600); err != nil {
		log.Printf("[identity] WARNING: failed to persist instance seed: %v", err)
	}
	return seed
}
