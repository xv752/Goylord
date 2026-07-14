//go:build linux && !android

package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strings"
)

const instanceSeedFile = "config/instance_seed"

func getOrCreateInstanceSeed() string {
	data, err := os.ReadFile(instanceSeedFile)
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

	if err := os.MkdirAll("config", 0700); err != nil {
		log.Printf("[identity] WARNING: failed to create config dir for instance seed: %v", err)
		return seed
	}
	if err := os.WriteFile(instanceSeedFile, []byte(seed), 0600); err != nil {
		log.Printf("[identity] WARNING: failed to persist instance seed: %v", err)
	}
	return seed
}
