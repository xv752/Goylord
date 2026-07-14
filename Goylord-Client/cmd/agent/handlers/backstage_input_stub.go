//go:build !windows

package handlers

func setCursorPosbackstage(x, y int32)        {}
func sendMouseDownbackstage(button int)       {}
func sendMouseUpbackstage(button int)         {}
func sendKeyDownbackstage(vk uint16)          {}
func sendKeyUpbackstage(vk uint16)            {}
func keyCodeToVKbackstage(code string) uint16 { return 0 }
