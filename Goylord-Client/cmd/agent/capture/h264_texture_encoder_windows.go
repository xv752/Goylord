//go:build windows

package capture

import (
	"fmt"
	"strings"
	"sync"
	"time"
	"unsafe"
)

const d3d11H264FailureCooldown = 30 * time.Second

type d3d11H264FailureKey struct {
	backend                                                 string
	device                                                  uintptr
	inputWidth, inputHeight, encodeWidth, encodeHeight, fps int
	dxgiFormat                                              uint32
}

type d3d11H264Failure struct {
	until time.Time
	err   string
}

type h264D3D11TextureRequest struct {
	Device       unsafe.Pointer
	Texture      unsafe.Pointer
	InputWidth   int
	InputHeight  int
	EncodeWidth  int
	EncodeHeight int
	FPS          int
	DXGIFormat   uint32
	ForceIDR     bool
}

type h264D3D11TextureBackend interface {
	Name() string
	Encode(h264D3D11TextureRequest) ([]byte, error)
	RequestKeyframe()
	Reset()
}

type nvencD3D11TextureBackend struct{}

func (nvencD3D11TextureBackend) Name() string { return "NVIDIA NVENC" }

func (nvencD3D11TextureBackend) Encode(req h264D3D11TextureRequest) ([]byte, error) {
	return encodeNativeH264D3D11Texture(req.Device, req.Texture, req.InputWidth, req.InputHeight,
		req.EncodeWidth, req.EncodeHeight, req.FPS, req.DXGIFormat, req.ForceIDR)
}

func (nvencD3D11TextureBackend) RequestKeyframe() {
	requestNativeH264D3D11TextureKeyframe()
}

func (nvencD3D11TextureBackend) Reset() {
	resetNativeH264D3D11TextureEncoder()
}

var d3d11H264TextureRegistry = struct {
	sync.Mutex
	backends []h264D3D11TextureBackend
	active   h264D3D11TextureBackend
	failures map[d3d11H264FailureKey]d3d11H264Failure
}{
	backends: []h264D3D11TextureBackend{nvencD3D11TextureBackend{}},
	failures: make(map[d3d11H264FailureKey]d3d11H264Failure),
}

func init() {
	if backend := newQSVD3D11TextureBackend(); backend != nil {
		d3d11H264TextureRegistry.backends = append(d3d11H264TextureRegistry.backends, backend)
	}
	if backend := newAMFD3D11TextureBackend(); backend != nil {
		d3d11H264TextureRegistry.backends = append(d3d11H264TextureRegistry.backends, backend)
	}
}

func encodeH264D3D11Texture(req h264D3D11TextureRequest) ([]byte, string, error) {
	if req.Device == nil || req.Texture == nil {
		return nil, "", fmt.Errorf("nil D3D11 device or texture")
	}
	d3d11H264TextureRegistry.Lock()
	defer d3d11H264TextureRegistry.Unlock()

	failedActiveName := ""
	errorsByBackend := make([]string, 0, len(d3d11H264TextureRegistry.backends))
	if active := d3d11H264TextureRegistry.active; active != nil {
		key := d3d11H264FailureKeyFor(active.Name(), req)
		if failure, failed := activeD3D11H264Failure(key, time.Now()); !failed {
			out, err := active.Encode(req)
			if err == nil {
				delete(d3d11H264TextureRegistry.failures, key)
				return out, active.Name(), nil
			}
			rememberD3D11H264Failure(key, err)
			active.Reset()
			failedActiveName = active.Name()
			errorsByBackend = append(errorsByBackend, active.Name()+": "+err.Error())
			d3d11H264TextureRegistry.active = nil
		} else {
			errorsByBackend = append(errorsByBackend, active.Name()+": "+failure.err+" (cooldown)")
			active.Reset()
			failedActiveName = active.Name()
			d3d11H264TextureRegistry.active = nil
		}
	}

	now := time.Now()
	for _, backend := range d3d11H264TextureRegistry.backends {
		if backend == nil || (failedActiveName != "" && backend.Name() == failedActiveName) {
			continue
		}
		key := d3d11H264FailureKeyFor(backend.Name(), req)
		if failure, failed := activeD3D11H264Failure(key, now); failed {
			errorsByBackend = append(errorsByBackend, backend.Name()+": "+failure.err+" (cooldown)")
			continue
		}
		out, err := backend.Encode(req)
		if err == nil {
			delete(d3d11H264TextureRegistry.failures, key)
			d3d11H264TextureRegistry.active = backend
			return out, backend.Name(), nil
		}
		backend.Reset()
		rememberD3D11H264Failure(key, err)
		errorsByBackend = append(errorsByBackend, backend.Name()+": "+err.Error())
	}
	if len(errorsByBackend) == 0 {
		return nil, "", fmt.Errorf("no D3D11 H.264 texture encoder backends registered")
	}
	return nil, "", fmt.Errorf("D3D11 H.264 texture encoders unavailable: %s", strings.Join(errorsByBackend, "; "))
}

func d3d11H264FailureKeyFor(backend string, req h264D3D11TextureRequest) d3d11H264FailureKey {
	return d3d11H264FailureKey{
		backend: backend, device: uintptr(req.Device), inputWidth: req.InputWidth, inputHeight: req.InputHeight,
		encodeWidth: req.EncodeWidth, encodeHeight: req.EncodeHeight, fps: req.FPS, dxgiFormat: req.DXGIFormat,
	}
}

func activeD3D11H264Failure(key d3d11H264FailureKey, now time.Time) (d3d11H264Failure, bool) {
	failure, ok := d3d11H264TextureRegistry.failures[key]
	if !ok {
		return d3d11H264Failure{}, false
	}
	if !now.Before(failure.until) {
		delete(d3d11H264TextureRegistry.failures, key)
		return d3d11H264Failure{}, false
	}
	return failure, true
}

func rememberD3D11H264Failure(key d3d11H264FailureKey, err error) {
	if len(d3d11H264TextureRegistry.failures) > 128 {
		now := time.Now()
		for existingKey, failure := range d3d11H264TextureRegistry.failures {
			if !now.Before(failure.until) {
				delete(d3d11H264TextureRegistry.failures, existingKey)
			}
		}
	}
	d3d11H264TextureRegistry.failures[key] = d3d11H264Failure{until: time.Now().Add(d3d11H264FailureCooldown), err: err.Error()}
}

func requestH264D3D11TextureKeyframe() {
	d3d11H264TextureRegistry.Lock()
	defer d3d11H264TextureRegistry.Unlock()
	if d3d11H264TextureRegistry.active != nil {
		d3d11H264TextureRegistry.active.RequestKeyframe()
		return
	}
	for _, backend := range d3d11H264TextureRegistry.backends {
		if backend != nil {
			backend.RequestKeyframe()
		}
	}
}

func resetH264D3D11TextureEncoder() {
	d3d11H264TextureRegistry.Lock()
	defer d3d11H264TextureRegistry.Unlock()
	for _, backend := range d3d11H264TextureRegistry.backends {
		if backend != nil {
			backend.Reset()
		}
	}
	d3d11H264TextureRegistry.active = nil
}
