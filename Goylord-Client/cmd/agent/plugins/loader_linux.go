//go:build linux

package plugins

import (
	"errors"
	"fmt"
	"io"
	"syscall"
	"unsafe"
)

const sysMemfdCreate = 419 // syscall.SYS_memfd_create on linux/amd64

func memfdCreate(flags uintptr) (int, error) {
	fd, _, errno := syscall.Syscall(sysMemfdCreate, 0, uintptr(unsafe.Pointer(&([]byte("plugin\x00")[0]))), flags)
	if errno != 0 {
		return -1, errno
	}
	return int(fd), nil
}

func writeAll(fd int, data []byte) error {
	for len(data) > 0 {
		n, err := syscall.Write(fd, data)
		if n > 0 {
			data = data[n:]
		}
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}

func loadNativePlugin(manifest PluginManifest, data []byte) (NativePlugin, error) {
	if len(data) == 0 {
		return nil, errors.New("empty plugin binary")
	}
	if len(pluginHostBinary) == 0 {
		return nil, errors.New("native plugins not supported: plugin host shim not compiled for this architecture")
	}

	p, err := loadNativePluginSubproc(data)
	if err == nil {
		return p, nil
	}
	return nil, fmt.Errorf("plugin host shim: %w", err)
}

func closeFd(fd int) {
	syscall.Close(fd)
}
