//go:build windows

package handlers

func keyCodeToVKbackstage(code string) uint16 {
	return keyCodeToVK(code)
}
