//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

type exceptionRecord struct {
	ExceptionCode        uint32
	ExceptionFlags       uint32
	ExceptionRecord      uintptr
	ExceptionAddress     uintptr
	NumberParameters     uint32
	ExceptionInformation [15]uintptr
}

type exceptionPointers struct {
	ExceptionRecord uintptr
	ContextRecord   uintptr
}

var hardCrashCallback uintptr

var procSetUnhandledExceptionFilter = windows.NewLazySystemDLL("kernel32.dll").NewProc("SetUnhandledExceptionFilter")

func installHardCrashReporter() {
	hardCrashCallback = syscall.NewCallback(func(info uintptr) uintptr {
		detail := "unhandled native exception"
		if info != 0 {
			ptrs := (*exceptionPointers)(unsafe.Pointer(info))
			if ptrs.ExceptionRecord != 0 {
				rec := (*exceptionRecord)(unsafe.Pointer(ptrs.ExceptionRecord))
				detail = fmt.Sprintf("exception=0x%08x address=0x%x flags=0x%x", rec.ExceptionCode, rec.ExceptionAddress, rec.ExceptionFlags)
			}
		}
		path := writeCrashLog("hard crash: "+detail, nil)
		writePendingCrashReport("crash", detail, path)
		return 0
	})
	procSetUnhandledExceptionFilter.Call(hardCrashCallback)
}
