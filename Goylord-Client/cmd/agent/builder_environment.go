//go:build builder_release

package main

import (
	"os"
	"strings"
)

func sanitizeBuilderEnvironment() {
	for _, entry := range os.Environ() {
		name, _, ok := strings.Cut(entry, "=")
		if ok && strings.HasPrefix(strings.ToUpper(name), "GOYLORD_") {
			_ = os.Unsetenv(name)
		}
	}
}
