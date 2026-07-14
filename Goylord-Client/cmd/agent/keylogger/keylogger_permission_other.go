//go:build !darwin && !nokeylogger
// +build !darwin,!nokeylogger

package keylogger

func (k *Keylogger) NeedsPermissionGate() bool {
	return false
}

func (k *Keylogger) RequestPermission() bool {
	k.mu.Lock()
	k.permissionGranted = true
	k.mu.Unlock()
	return true
}

func (k *Keylogger) HasPermission() bool {
	return true
}
