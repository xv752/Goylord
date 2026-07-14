//go:build windows

package capture

import (
	"encoding/binary"
	"fmt"
	"log"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

// backstageFrameHeader mirrors the C backstageFrameHeader struct.
// must be kept in sync with BackstageCapture/src/DXGICapture.h.
type backstageFrameHeader struct {
	Magic       uint32
	Version     uint32
	Width       uint32
	Height      uint32
	Stride      uint32
	Format      uint32
	FrameSeq    uint64
	TimestampNs uint64
	PID         uint32
	Reserved    uint32
}

const (
	backstageFrameMagic      = 0x434E5648 // 'backstage'
	backstageFrameVersion    = 1
	backstageFrameHeaderSize = 48 // sizeof(backstageFrameHeader)
	backstageShmPrefix       = `Local\backstage_frame_`
	backstageEventPrefix     = `Local\backstage_evt_`
)

var (
	procOpenFileMappingW = kernel32.NewProc("OpenFileMappingW")
	procOpenEventW       = kernel32.NewProc("OpenEventW")
)

const (
	FILE_MAP_READ    = 0x0004
	EVENT_ALL_ACCESS = 0x1F0003
	SYNCHRONIZE      = 0x00100000
)

type backstageFrameReader struct {
	pid        uint32
	shmHandle  uintptr
	shmView    unsafe.Pointer
	shmSize    uintptr
	evtHandle  uintptr
	lastSeq    uint64
	staleCount int
	mu         sync.Mutex
}

var (
	backstageFrameReaders   = make(map[uint32]*backstageFrameReader)
	backstageFrameReadersMu sync.Mutex

	backstageGPUPIDMap = make(map[uint32]uint32)
)

func backstageRegisterGPUPID(browserPID, gpuPID uint32) {
	backstageFrameReadersMu.Lock()
	backstageGPUPIDMap[browserPID] = gpuPID
	backstageFrameReadersMu.Unlock()
	log.Printf("backstage dxgi: registered GPU PID %d for browser PID %d", gpuPID, browserPID)
}

func backstageGetFrameReader(pid uint32) *backstageFrameReader {
	backstageFrameReadersMu.Lock()
	defer backstageFrameReadersMu.Unlock()

	if r, ok := backstageFrameReaders[pid]; ok {
		if r.staleCount > 300 {
			log.Printf("backstage dxgi: evicting stale reader for PID %d (stale %d frames)", pid, r.staleCount)
			r.close()
			delete(backstageFrameReaders, pid)
		} else {
			return r
		}
	}

	shmName, _ := syscall.UTF16PtrFromString(fmt.Sprintf("%s%d", backstageShmPrefix, pid))
	shmHandle, _, _ := procOpenFileMappingW.Call(
		FILE_MAP_READ,
		0,
		uintptr(unsafe.Pointer(shmName)),
	)
	if shmHandle == 0 {
		return nil
	}

	view, _, _ := procMapViewOfFile.Call(
		shmHandle,
		FILE_MAP_READ,
		0, 0,
		backstageFrameHeaderSize,
	)
	if view == 0 {
		procCloseHandle.Call(shmHandle)
		return nil
	}

	hdr := (*backstageFrameHeader)(unsafe.Pointer(view))
	if hdr.Magic != backstageFrameMagic {
		procUnmapViewOfFile.Call(view)
		procCloseHandle.Call(shmHandle)
		return nil
	}

	fullSize := uintptr(backstageFrameHeaderSize) + uintptr(hdr.Stride)*uintptr(hdr.Height)

	procUnmapViewOfFile.Call(view)
	view = 0
	hdr = nil

	fullView, _, _ := procMapViewOfFile.Call(
		shmHandle,
		FILE_MAP_READ,
		0, 0,
		fullSize,
	)
	if fullView == 0 {
		procCloseHandle.Call(shmHandle)
		return nil
	}

	hdr2 := (*backstageFrameHeader)(unsafe.Pointer(fullView))

	evtName, _ := syscall.UTF16PtrFromString(fmt.Sprintf("%s%d", backstageEventPrefix, pid))
	evtHandle, _, _ := procOpenEventW.Call(
		SYNCHRONIZE,
		0,
		uintptr(unsafe.Pointer(evtName)),
	)

	r := &backstageFrameReader{
		pid:       pid,
		shmHandle: shmHandle,
		shmView:   unsafe.Pointer(fullView),
		shmSize:   fullSize,
		evtHandle: evtHandle,
	}
	backstageFrameReaders[pid] = r

	log.Printf("backstage dxgi: opened shared memory for PID %d (%dx%d, %d bytes)",
		pid, hdr2.Width, hdr2.Height, fullSize)
	return r
}

func (r *backstageFrameReader) readFrame(dst []byte) (w, h int, ok bool) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.shmView == nil {
		return 0, 0, false
	}

	hdr := (*backstageFrameHeader)(r.shmView)
	if hdr.Magic != backstageFrameMagic || hdr.Version != backstageFrameVersion {
		return 0, 0, false
	}

	w = int(hdr.Width)
	h = int(hdr.Height)
	stride := int(hdr.Stride)

	if w <= 0 || h <= 0 || w > 7680 || h > 4320 || stride <= 0 || stride > 7680*4 {
		return 0, 0, false
	}

	dstStride := w * 4
	if stride < dstStride {
		return 0, 0, false // stride must be >= w*4
	}

	needed := w * h * 4
	if len(dst) < needed {
		return 0, 0, false
	}

	totalNeeded := uintptr(backstageFrameHeaderSize) + uintptr(stride)*uintptr(h)
	if totalNeeded > r.shmSize {
		r.remap(w, h, stride)
		if r.shmView == nil {
			return 0, 0, false
		}
		hdr = (*backstageFrameHeader)(r.shmView)
		if hdr.Magic != backstageFrameMagic || int(hdr.Width) != w || int(hdr.Height) != h {
			return 0, 0, false
		}
	}

	pixelData := unsafe.Add(r.shmView, backstageFrameHeaderSize)
	srcSize := stride * h
	src := unsafe.Slice((*byte)(pixelData), srcSize)

	for y := 0; y < h; y++ {
		srcOff := y * stride
		dstOff := y * dstStride
		copy(dst[dstOff:dstOff+dstStride], src[srcOff:srcOff+dstStride])
	}

	seq := hdr.FrameSeq
	if seq != r.lastSeq {
		r.lastSeq = seq
		r.staleCount = 0
	} else {
		r.staleCount++
	}

	return w, h, true
}

func (r *backstageFrameReader) remap(w, h, stride int) {
	if r.shmView != nil {
		procUnmapViewOfFile.Call(uintptr(r.shmView))
		r.shmView = nil
	}

	newSize := uintptr(backstageFrameHeaderSize) + uintptr(stride)*uintptr(h)
	view, _, _ := procMapViewOfFile.Call(
		r.shmHandle,
		FILE_MAP_READ,
		0, 0,
		newSize,
	)
	if view == 0 {
		return
	}
	r.shmView = unsafe.Pointer(view)
	r.shmSize = newSize
}

func (r *backstageFrameReader) close() {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.shmView != nil {
		procUnmapViewOfFile.Call(uintptr(r.shmView))
		r.shmView = nil
	}
	if r.shmHandle != 0 {
		procCloseHandle.Call(r.shmHandle)
		r.shmHandle = 0
	}
	if r.evtHandle != 0 {
		procCloseHandle.Call(r.evtHandle)
		r.evtHandle = 0
	}
}

func backstageCleanupFrameReaders() {
	backstageFrameReadersMu.Lock()
	defer backstageFrameReadersMu.Unlock()

	for pid, r := range backstageFrameReaders {
		r.close()
		delete(backstageFrameReaders, pid)
	}
	for k := range backstageGPUPIDMap {
		delete(backstageGPUPIDMap, k)
	}
}

var (
	backstageInjectedPIDs   = make(map[uint32]time.Time)
	backstageInjectedPIDsMu sync.Mutex
)

func backstageRegisterInjectedPID(pid uint32) {
	backstageInjectedPIDsMu.Lock()
	backstageInjectedPIDs[pid] = time.Now()
	backstageInjectedPIDsMu.Unlock()
}

func backstageGetInjectedPIDs() []uint32 {
	backstageInjectedPIDsMu.Lock()
	defer backstageInjectedPIDsMu.Unlock()
	pids := make([]uint32, 0, len(backstageInjectedPIDs))
	for pid := range backstageInjectedPIDs {
		pids = append(pids, pid)
	}
	return pids
}

func backstageUnregisterInjectedPID(pid uint32) {
	backstageInjectedPIDsMu.Lock()
	delete(backstageInjectedPIDs, pid)
	backstageInjectedPIDsMu.Unlock()
}

func parsebackstageFrameHeader(data []byte) (*backstageFrameHeader, bool) {
	if len(data) < backstageFrameHeaderSize {
		return nil, false
	}
	hdr := &backstageFrameHeader{
		Magic:       binary.LittleEndian.Uint32(data[0:4]),
		Version:     binary.LittleEndian.Uint32(data[4:8]),
		Width:       binary.LittleEndian.Uint32(data[8:12]),
		Height:      binary.LittleEndian.Uint32(data[12:16]),
		Stride:      binary.LittleEndian.Uint32(data[16:20]),
		Format:      binary.LittleEndian.Uint32(data[20:24]),
		FrameSeq:    binary.LittleEndian.Uint64(data[24:32]),
		TimestampNs: binary.LittleEndian.Uint64(data[32:40]),
		PID:         binary.LittleEndian.Uint32(data[40:44]),
		Reserved:    binary.LittleEndian.Uint32(data[44:48]),
	}
	if hdr.Magic != backstageFrameMagic {
		return nil, false
	}
	return hdr, true
}
