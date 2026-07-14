//go:build windows && arm64

package teb

func CurrentTEB() uintptr {
	return 0
}
