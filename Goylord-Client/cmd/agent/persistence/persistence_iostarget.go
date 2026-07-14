//go:build ios || ios_target

package persistence

import "fmt"

func install(_ string) error {
	return fmt.Errorf("persistence is not supported on iOS")
}

func configure(_ string) error {
	return fmt.Errorf("persistence is not supported on iOS")
}

func getTargetPath() (string, error) {
	return "", fmt.Errorf("persistence is not supported on iOS")
}

func uninstall() error {
	return nil
}

func removeCurrentInstall(_ string) error {
	return nil
}
