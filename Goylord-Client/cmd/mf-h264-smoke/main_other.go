//go:build !windows

package main

import "fmt"

func main() {
	fmt.Println("mf-h264-smoke is only supported on Windows")
}
