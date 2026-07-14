//go:build windows && 386

package teb

func CurrentTEB() uintptr {
	return 0
}
