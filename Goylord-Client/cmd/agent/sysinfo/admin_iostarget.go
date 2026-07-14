//go:build ios || ios_target

package sysinfo

func IsAdmin() bool {
	return false
}

func Elevation() string {
	return ""
}

func DarwinPermissions() map[string]bool {
	return nil
}

func DarwinPermissionsRefresh() map[string]bool {
	return nil
}

func RequestDarwinPermissions(_ []string) map[string]bool {
	return nil
}
