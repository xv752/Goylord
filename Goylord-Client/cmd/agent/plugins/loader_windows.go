//go:build windows

package plugins

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	loadLibrarySearchDLLLoadDir  = 0x00000100
	loadLibrarySearchDefaultDirs = 0x00001000
)

var procLoadLibraryExW = modKernel32.NewProc("LoadLibraryExW")

func loadNativePlugin(manifest PluginManifest, data []byte) (NativePlugin, error) {
	if len(data) == 0 {
		return nil, errors.New("empty plugin binary")
	}
	if shouldUseOSNativeLoader(manifest.NativeLoader) {
		return loadNativePluginOS(manifest, data)
	}
	return loadNativePluginMemory(manifest, data)
}

func shouldUseOSNativeLoader(loader string) bool {
	switch strings.ToLower(strings.TrimSpace(loader)) {
	case "os", "disk", "file", "loadlibrary", "loadlibraryex":
		return true
	default:
		return false
	}
}

func loadNativePluginMemory(manifest PluginManifest, data []byte) (NativePlugin, error) {
	entries := nativeEntries(manifest)

	type initResult struct {
		dp  *dllPlugin
		err error
	}
	ch := make(chan initResult, 1)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				ch <- initResult{err: fmt.Errorf("plugin init panic: %v", r)}
			}
		}()
		runtime.LockOSThread()

		mm, err := LoadMemoryModule(data)
		if err != nil {
			ch <- initResult{err: fmt.Errorf("pe load: %w", err)}
			runtime.UnlockOSThread()
			return
		}

		if err := mm.CallEntryPoint(dllProcessAttach); err != nil {
			mm.Free()
			ch <- initResult{err: fmt.Errorf("DllMain init: %w", err)}
			runtime.UnlockOSThread()
			return
		}

		onLoad, err := mm.GetExport(entries.onLoad)
		if err != nil {
			mm.Free()
			ch <- initResult{err: err}
			runtime.UnlockOSThread()
			return
		}
		onEvent, err := mm.GetExport(entries.onEvent)
		if err != nil {
			mm.Free()
			ch <- initResult{err: err}
			runtime.UnlockOSThread()
			return
		}
		onUnload, err := mm.GetExport(entries.onUnload)
		if err != nil {
			mm.Free()
			ch <- initResult{err: err}
			runtime.UnlockOSThread()
			return
		}

		setCallback, _ := mm.GetExport(entries.setCallback)

		rt := "go"
		if getRuntimeAddr, err := mm.GetExport(entries.getRuntime); err == nil {
			ret, _, _ := syscall.SyscallN(getRuntimeAddr)
			if ret != 0 {
				var buf [32]byte
				for i := range buf {
					b := *(*byte)(unsafe.Pointer(ret + uintptr(i)))
					if b == 0 {
						rt = string(buf[:i])
						break
					}
					buf[i] = b
				}
			}
		}

		dp := &dllPlugin{
			mem:             mm,
			onLoadAddr:      onLoad,
			onEventAddr:     onEvent,
			onUnloadAddr:    onUnload,
			setCallbackAddr: setCallback,
			pluginRuntime:   rt,
			workCh:          make(chan pluginWork),
		}

		ch <- initResult{dp: dp}

		dp.workerLoop()

		runtime.UnlockOSThread()
	}()

	res := <-ch
	if res.err != nil {
		return nil, res.err
	}
	return res.dp, nil
}

func loadNativePluginOS(manifest PluginManifest, data []byte) (NativePlugin, error) {
	entries := nativeEntries(manifest)
	dllPath, err := stageNativePluginDLL(manifest, data)
	if err != nil {
		return nil, err
	}
	path16, err := windows.UTF16PtrFromString(dllPath)
	if err != nil {
		return nil, err
	}
	flags := uintptr(loadLibrarySearchDLLLoadDir | loadLibrarySearchDefaultDirs)
	h, _, callErr := procLoadLibraryExW.Call(uintptr(unsafe.Pointer(path16)), 0, flags)
	if h == 0 {
		return nil, fmt.Errorf("LoadLibraryExW(%s): %w", dllPath, callErr)
	}
	module := windows.Handle(h)

	resolve := func(name string, required bool) (uintptr, error) {
		addr, err := windows.GetProcAddress(module, name)
		if err != nil {
			if required {
				return 0, fmt.Errorf("GetProcAddress(%s): %w", name, err)
			}
			return 0, nil
		}
		return addr, nil
	}

	onLoad, err := resolve(entries.onLoad, true)
	if err != nil {
		_ = windows.FreeLibrary(module)
		return nil, err
	}
	onEvent, err := resolve(entries.onEvent, true)
	if err != nil {
		_ = windows.FreeLibrary(module)
		return nil, err
	}
	onUnload, err := resolve(entries.onUnload, true)
	if err != nil {
		_ = windows.FreeLibrary(module)
		return nil, err
	}
	setCallback, _ := resolve(entries.setCallback, false)

	rt := "go"
	if getRuntimeAddr, err := resolve(entries.getRuntime, false); err == nil && getRuntimeAddr != 0 {
		ret, _, _ := syscall.SyscallN(getRuntimeAddr)
		if ret != 0 {
			var buf [32]byte
			for i := range buf {
				b := *(*byte)(unsafe.Pointer(ret + uintptr(i)))
				if b == 0 {
					rt = string(buf[:i])
					break
				}
				buf[i] = b
			}
		}
	}

	dp := &dllPlugin{
		module:          module,
		modulePath:      dllPath,
		onLoadAddr:      onLoad,
		onEventAddr:     onEvent,
		onUnloadAddr:    onUnload,
		setCallbackAddr: setCallback,
		pluginRuntime:   rt,
		workCh:          make(chan pluginWork),
	}
	go dp.workerLoop()
	return dp, nil
}

func stageNativePluginDLL(manifest PluginManifest, data []byte) (string, error) {
	sum := sha256.Sum256(data)
	hash := hex.EncodeToString(sum[:])
	root, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(root) == "" {
		root = os.TempDir()
	}
	pluginID := sanitizeCacheName(manifest.ID)
	if pluginID == "" {
		pluginID = "plugin"
	}
	dir := filepath.Join(root, "Goylord", "plugins", pluginID, hash)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", fmt.Errorf("create plugin cache: %w", err)
	}
	target := filepath.Join(dir, pluginID+".dll")
	if st, err := os.Stat(target); err == nil && st.Size() == int64(len(data)) {
		return target, nil
	}
	tmp := target + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return "", fmt.Errorf("write plugin cache: %w", err)
	}
	if err := os.Rename(tmp, target); err != nil {
		_ = os.Remove(tmp)
		if st, statErr := os.Stat(target); statErr == nil && st.Size() == int64(len(data)) {
			return target, nil
		}
		return "", fmt.Errorf("finalize plugin cache: %w", err)
	}
	return target, nil
}

func sanitizeCacheName(value string) string {
	value = strings.TrimSpace(value)
	var b strings.Builder
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r == '.' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

type pluginWork struct {
	fn   func() error
	done chan error
}

type dllPlugin struct {
	mem             *MemoryModule
	module          windows.Handle
	modulePath      string
	onLoadAddr      uintptr
	onEventAddr     uintptr
	onUnloadAddr    uintptr
	setCallbackAddr uintptr
	callbackHandle  uintptr // prevent GC of the callback closure
	pluginRuntime   string  // "go", "c", "cpp", etc.
	workCh          chan pluginWork
}

func (p *dllPlugin) workerLoop() {
	for w := range p.workCh {
		w.done <- w.fn()
	}
}

func (p *dllPlugin) runOnWorker(fn func() error) error {
	done := make(chan error, 1)
	p.workCh <- pluginWork{fn: fn, done: done}
	return <-done
}

func (p *dllPlugin) Load(send func(string, []byte), hostInfo []byte) error {
	return p.runOnWorker(func() error {
		// Create a stdcall callback the DLL can invoke to send events to the host.
		cb := syscall.NewCallback(func(eventPtr, eventLen, payloadPtr, payloadLen uintptr) uintptr {
			event := make([]byte, eventLen)
			if eventLen > 0 {
				copy(event, unsafe.Slice((*byte)(unsafe.Pointer(eventPtr)), eventLen))
			}
			payload := make([]byte, payloadLen)
			if payloadLen > 0 {
				copy(payload, unsafe.Slice((*byte)(unsafe.Pointer(payloadPtr)), payloadLen))
			}
			send(string(event), payload)
			return 0
		})
		p.callbackHandle = cb

		if p.setCallbackAddr != 0 {
			syscall.SyscallN(p.setCallbackAddr, cb)
		}

		var infoPtr uintptr
		infoLen := uintptr(len(hostInfo))
		if len(hostInfo) > 0 {
			infoPtr = uintptr(unsafe.Pointer(&hostInfo[0]))
		}
		ret, _, _ := syscall.SyscallN(p.onLoadAddr, infoPtr, infoLen, cb)
		if int32(ret) != 0 {
			return errors.New("PluginOnLoad returned non-zero")
		}
		return nil
	})
}

func (p *dllPlugin) Event(event string, payload []byte) error {
	eventBytes := []byte(event)
	payloadCopy := make([]byte, len(payload))
	copy(payloadCopy, payload)

	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[panic] plugin event panic: %v", r)
			}
		}()
		if err := p.runOnWorker(func() error {
			var eventPtr, payloadPtr uintptr
			eventLen := uintptr(len(eventBytes))
			payloadLen := uintptr(len(payloadCopy))
			if len(eventBytes) > 0 {
				eventPtr = uintptr(unsafe.Pointer(&eventBytes[0]))
			}
			if len(payloadCopy) > 0 {
				payloadPtr = uintptr(unsafe.Pointer(&payloadCopy[0]))
			}
			ret, _, _ := syscall.SyscallN(p.onEventAddr, eventPtr, eventLen, payloadPtr, payloadLen)
			if int32(ret) != 0 {
				return errors.New("PluginOnEvent returned non-zero")
			}
			return nil
		}); err != nil {
			log.Printf("[plugin] event error: %v", err)
		}
	}()
	return nil
}

func (p *dllPlugin) Unload() {
	_ = p.runOnWorker(func() error {
		if p.onUnloadAddr != 0 {
			syscall.SyscallN(p.onUnloadAddr)
		}
		return nil
	})
}

func (p *dllPlugin) Close() error {
	p.Unload()
	close(p.workCh)
	if p.pluginRuntime != "go" {
		if p.mem != nil {
			p.mem.Free()
			p.mem = nil
		}
		if p.module != 0 {
			_ = windows.FreeLibrary(p.module)
			p.module = 0
		}
	} else {
		p.mem = nil
		p.module = 0
	}
	return nil
}

func (p *dllPlugin) Runtime() string {
	return p.pluginRuntime
}
