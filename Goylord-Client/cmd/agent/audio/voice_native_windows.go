//go:build !cgo && windows

package audio

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	voiceSampleRate     = 16000
	voiceChannels       = 1
	voiceBytesPerSample = 2
)

const maxPlaybackBufferBytes = (voiceSampleRate * voiceChannels * voiceBytesPerSample * 250) / 1000

const (
	_waveFormatPCM = 0x0001
	_waveMapper    = 0xFFFFFFFF

	_mmWimOpen  = 0x3BE
	_mmWimClose = 0x3BF
	_mmWimData  = 0x3C0

	_mmWomOpen  = 0x3BB
	_mmWomClose = 0x3BC
	_mmWomDone  = 0x3BD

	_whdrDone = 0x1
)

// WAVEFORMATEX for the waveIn/waveOut APIs
type _waveFormat struct {
	tag         uint16
	channels    uint16
	sampleRate  uint32
	avgBytes    uint32
	blockAlign  uint16
	bitsPerSec  uint16
	cbSize      uint16
}

// WAVEHDR for audio buffers
type _waveHdr struct {
	data       uintptr
	bufferLen  uint32
	bytesRecorded uint32
	user       uintptr
	flags      uint32
	loopCount  uint32
	loopNext   uintptr
	reserved   uintptr
}

var (
	_winmm = syscall.NewLazyDLL("winmm.dll")

	_procWaveInGetNumDevs  = _winmm.NewProc("waveInGetNumDevs")
	_procWaveInGetDevCapsW = _winmm.NewProc("waveInGetDevCapsW")
	_procWaveInOpen        = _winmm.NewProc("waveInOpen")
	_procWaveInClose       = _winmm.NewProc("waveInClose")
	_procWaveInPrepare     = _winmm.NewProc("waveInPrepareHeader")
	_procWaveInUnprepare   = _winmm.NewProc("waveInUnprepareHeader")
	_procWaveInAddBuffer   = _winmm.NewProc("waveInAddBuffer")
	_procWaveInStart       = _winmm.NewProc("waveInStart")
	_procWaveInStop        = _winmm.NewProc("waveInStop")

	_procWaveOutGetNumDevs  = _winmm.NewProc("waveOutGetNumDevs")
	_procWaveOutGetDevCapsW = _winmm.NewProc("waveOutGetDevCapsW")
	_procWaveOutOpen        = _winmm.NewProc("waveOutOpen")
	_procWaveOutClose       = _winmm.NewProc("waveOutClose")
	_procWaveOutPrepare     = _winmm.NewProc("waveOutPrepareHeader")
	_procWaveOutUnprepare   = _winmm.NewProc("waveOutUnprepareHeader")
	_procWaveOutWrite       = _winmm.NewProc("waveOutWrite")
	_procWaveOutPause       = _winmm.NewProc("waveOutPause")
	_procWaveOutRestart     = _winmm.NewProc("waveOutRestart")
	_procWaveOutReset       = _winmm.NewProc("waveOutReset")

	_newCallback = syscall.NewCallback(_audioCallback)
)

// Callback state
var (
	_callbackMu   sync.Mutex
	_callbackData = map[uintptr]*_callbackState{}
)

type _callbackState struct {
	onCapture  func([]byte)
	onPlayback func()
}

func _audioCallback(hdr uintptr, msg uintptr, instance uintptr, param1 uintptr, param2 uintptr) uintptr {
	_callbackMu.Lock()
	st := _callbackData[instance]
	_callbackMu.Unlock()

	if st == nil {
		return 0
	}

	switch msg {
	case _mmWimData:
		if st.onCapture != nil {
			h := (*_waveHdr)(unsafe.Pointer(hdr))
			if h.bytesRecorded > 0 {
				data := make([]byte, h.bytesRecorded)
				copy(data, unsafe.Slice((*byte)(unsafe.Pointer(h.data)), h.bytesRecorded))
				st.onCapture(data)
			}
			_procWaveInAddBuffer.Call(instance, hdr, unsafe.Sizeof(_waveHdr{}))
		}
	case _mmWomDone:
		if st.onPlayback != nil {
			st.onPlayback()
		}
	}
	return 0
}

// Playback buffer
type playbackBuffer struct {
	mu   sync.Mutex
	data []byte
}

func (b *playbackBuffer) Push(p []byte) {
	if len(p) == 0 {
		return
	}
	cp := make([]byte, len(p))
	copy(cp, p)
	b.mu.Lock()
	b.data = append(b.data, cp...)
	if len(b.data) > maxPlaybackBufferBytes {
		b.data = b.data[len(b.data)-maxPlaybackBufferBytes:]
	}
	b.mu.Unlock()
}

func (b *playbackBuffer) Pop(n int) []byte {
	if n <= 0 {
		return nil
	}
	out := make([]byte, n)
	for i := range out {
		out[i] = 0
	}
	b.mu.Lock()
	copied := copy(out, b.data)
	if copied > 0 {
		b.data = b.data[copied:]
	}
	b.mu.Unlock()
	return out
}

// Session
type Session struct {
	ctx        context.Context
	cancel     context.CancelFunc
	hWaveIn    uintptr
	hWaveOut   uintptr
	bufSize    int
	hdrs       []*_waveHdr
	wg         sync.WaitGroup
	closeMu    sync.Mutex
	isClosed   bool
	queue      *playbackBuffer
	id         uintptr
	playWg     sync.WaitGroup
}

func _targetFormat() *_waveFormat {
	return &_waveFormat{
		tag:        _waveFormatPCM,
		channels:   voiceChannels,
		sampleRate: voiceSampleRate,
		avgBytes:   voiceSampleRate * voiceChannels * voiceBytesPerSample,
		blockAlign: voiceChannels * voiceBytesPerSample,
		bitsPerSec: voiceChannels * voiceBytesPerSample * 8,
		cbSize:     0,
	}
}

func _resample(src []byte, srcRate, srcCh int) []byte {
	if srcRate == voiceSampleRate && srcCh == voiceChannels {
		return src
	}
	bpf := srcCh * voiceBytesPerSample
	if len(src) < bpf {
		return nil
	}
	srcFrames := len(src) / bpf
	dstFrames := int(float64(srcFrames) * float64(voiceSampleRate) / float64(srcRate))
	dst := make([]byte, dstFrames*2)
	scale := float64(srcRate) / float64(voiceSampleRate)
	for i := 0; i < dstFrames; i++ {
		sp := float64(i) * scale
		idx := int(sp)
		frac := sp - float64(idx)
		var s16 float64
		if idx+1 < srcFrames {
			v1 := float64(*(*int16)(unsafe.Pointer(&src[idx*bpf])))
			v2 := float64(*(*int16)(unsafe.Pointer(&src[(idx+1)*bpf])))
			s16 = v1*(1-frac) + v2*frac
		} else {
			s16 = float64(*(*int16)(unsafe.Pointer(&src[idx*bpf])))
		}
		if srcCh >= 2 {
			var r2 float64
			if idx+1 < srcFrames {
				r2 = float64(*(*int16)(unsafe.Pointer(&src[idx*bpf+2])))
			} else {
				r2 = s16
			}
			s16 = (s16 + r2) / 2
		}
		s16 = math.Max(-32768, math.Min(32767, s16))
		*(*int16)(unsafe.Pointer(&dst[i*2])) = int16(s16)
	}
	return dst
}

func ProbeCapabilities() Capabilities {
	caps := Capabilities{
		Available:     true,
		RequiresCGO:   false,
		Sources:       []string{"default", "system"},
		DefaultSource: "default",
	}

	numIn, _, _ := _procWaveInGetNumDevs.Call()
	for i := uint32(0); i < uint32(numIn) && i < 20; i++ {
		caps.Sources = append(caps.Sources, fmt.Sprintf("device:%d", i))
	}

	return caps
}

func _openWaveIn(source string, onCapture func([]byte)) (uintptr, uintptr, error) {
	wfx := _targetFormat()
	var h uintptr

	var id uint32
	switch {
	case strings.EqualFold(source, "system"), strings.Contains(strings.ToLower(source), "stereo mix"),
		strings.Contains(strings.ToLower(source), "loopback"),
		strings.Contains(strings.ToLower(source), "what u hear"),
		strings.Contains(strings.ToLower(source), "monitor"):
		numDevs, _, _ := _procWaveInGetNumDevs.Call()
		found := false
		for i := uint32(0); i < uint32(numDevs); i++ {
			var caps [256]byte
			_procWaveInGetDevCapsW.Call(uintptr(i), uintptr(unsafe.Pointer(&caps)), 256)
			name := _utf16ToString(&caps[0])
			nl := strings.ToLower(name)
			if strings.Contains(nl, "stereo mix") || strings.Contains(nl, "what u hear") ||
				strings.Contains(nl, "loopback") || strings.Contains(nl, "monitor") {
				id = i
				found = true
				break
			}
		}
		if !found {
			return 0, 0, errors.New("system audio capture device not found")
		}
	case strings.HasPrefix(strings.ToLower(source), "device:"):
		n := strings.TrimSpace(source[7:])
		if parsed, err := fmt.Sscanf(n, "%d"); err == nil && parsed == 1 {
			id = 0
			fmt.Sscanf(n, "%d", &id)
		} else {
			numDevs, _, _ := _procWaveInGetNumDevs.Call()
			for i := uint32(0); i < uint32(numDevs); i++ {
				var caps [256]byte
				_procWaveInGetDevCapsW.Call(uintptr(i), uintptr(unsafe.Pointer(&caps)), 256)
				if strings.EqualFold(_utf16ToString(&caps[0]), n) {
					id = i
					break
				}
			}
		}
	default:
		id = _waveMapper
	}

	// Generate a unique instance ID for callback dispatch
	inst := uintptr(unsafe.Pointer(&onCapture))

	r, _, _ := _procWaveInOpen.Call(
		uintptr(unsafe.Pointer(&h)),
		uintptr(id),
		uintptr(unsafe.Pointer(wfx)),
		_newCallback,
		inst,
		0x00030000, // CALLBACK_FUNCTION
	)
	if r != 0 {
		return 0, 0, fmt.Errorf("waveInOpen: %d", r)
	}

	_callbackMu.Lock()
	_callbackData[inst] = &_callbackState{onCapture: onCapture}
	_callbackMu.Unlock()

	return h, inst, nil
}

func _startCapture(h uintptr, inst uintptr, onCapture func([]byte)) ([]*_waveHdr, error) {
	bufSize := voiceSampleRate * voiceBytesPerSample // 1 second buffer
	var hdrs []*_waveHdr
	var hdrBufs [][]byte

	for i := 0; i < 4; i++ {
		buf := make([]byte, bufSize)
		hdrBufs = append(hdrBufs, buf)
		hdr := &_waveHdr{
			data:      uintptr(unsafe.Pointer(&buf[0])),
			bufferLen: uint32(bufSize),
		}
		hdrs = append(hdrs, hdr)

		_procWaveInPrepare.Call(h, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
		_procWaveInAddBuffer.Call(h, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
	}

	r, _, _ := _procWaveInStart.Call(h)
	if r != 0 {
		for _, hdr := range hdrs {
			_procWaveInUnprepare.Call(h, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
		}
		return nil, fmt.Errorf("waveInStart: %d", r)
	}
	return hdrs, nil
}

func StartVoiceSession(parent context.Context, source string, onCapture func([]byte)) (*Session, error) {
	if onCapture == nil {
		return nil, errors.New("capture callback required")
	}

	hIn, inst, err := _openWaveIn(source, onCapture)
	if err != nil {
		return nil, fmt.Errorf("capture open: %w", err)
	}

	hdrs, err := _startCapture(hIn, inst, onCapture)
	if err != nil {
		_procWaveInClose.Call(hIn)
		return nil, err
	}

	hOut, err := _openWaveOut()
	if err != nil {
		_procWaveInStop.Call(hIn)
		for _, hdr := range hdrs {
			_procWaveInUnprepare.Call(hIn, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
		}
		_procWaveInClose.Call(hIn)
		return nil, fmt.Errorf("render open: %w", err)
	}

	ctx, cancel := context.WithCancel(parent)
	s := &Session{
		ctx:      ctx,
		cancel:   cancel,
		hWaveIn:  hIn,
		hWaveOut: hOut,
		hdrs:     hdrs,
		queue:    &playbackBuffer{},
		id:       inst,
	}

	// Playback pump
	s.playWg.Add(1)
	go func() {
		defer s.playWg.Done()
		s._playLoop()
	}()

	return s, nil
}

func _openWaveOut() (uintptr, error) {
	wfx := _targetFormat()
	var h uintptr
	r, _, _ := _procWaveOutOpen.Call(
		uintptr(unsafe.Pointer(&h)),
		_waveMapper,
		uintptr(unsafe.Pointer(wfx)),
		0, 0, 0,
	)
	if r != 0 {
		return 0, fmt.Errorf("waveOutOpen: %d", r)
	}
	return h, nil
}

func (s *Session) _playLoop() {
	frameSize := voiceBytesPerSample * voiceChannels
	tick := time.NewTicker(time.Millisecond)
	defer tick.Stop()

	for {
		select {
		case <-s.ctx.Done():
			return
		case <-tick.C:
		}

		s.closeMu.Lock()
		closed := s.isClosed
		s.closeMu.Unlock()
		if closed {
			return
		}

		need := voiceSampleRate / 100 * frameSize // 10ms worth
		data := s.queue.Pop(need)
		if len(data) == 0 {
			continue
		}

		buf := make([]byte, len(data))
		copy(buf, data)
		hdr := &_waveHdr{
			data:      uintptr(unsafe.Pointer(&buf[0])),
			bufferLen: uint32(len(buf)),
		}
		_procWaveOutPrepare.Call(s.hWaveOut, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
		_procWaveOutWrite.Call(s.hWaveOut, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
	}
}

func StartCaptureOnlySession(parent context.Context, source string, onCapture func([]byte)) (*Session, error) {
	if onCapture == nil {
		return nil, errors.New("capture callback required")
	}

	hIn, inst, err := _openWaveIn(source, onCapture)
	if err != nil {
		return nil, fmt.Errorf("capture open: %w", err)
	}

	hdrs, err := _startCapture(hIn, inst, onCapture)
	if err != nil {
		_procWaveInClose.Call(hIn)
		return nil, err
	}

	ctx, cancel := context.WithCancel(parent)
	s := &Session{
		ctx:     ctx,
		cancel:  cancel,
		hWaveIn: hIn,
		hdrs:    hdrs,
		queue:   &playbackBuffer{},
		id:      inst,
	}
	return s, nil
}

func (s *Session) WritePlayback(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	s.closeMu.Lock()
	closed := s.isClosed
	s.closeMu.Unlock()
	if closed {
		return errors.New("session closed")
	}
	s.queue.Push(data)
	return nil
}

func (s *Session) Close() error {
	s.closeMu.Lock()
	if s.isClosed {
		s.closeMu.Unlock()
		return nil
	}
	s.isClosed = true
	s.closeMu.Unlock()

	s.cancel()

	if s.hWaveIn != 0 {
		_procWaveInStop.Call(s.hWaveIn)
		for _, hdr := range s.hdrs {
			_procWaveInUnprepare.Call(s.hWaveIn, uintptr(unsafe.Pointer(hdr)), unsafe.Sizeof(_waveHdr{}))
		}
		_procWaveInClose.Call(s.hWaveIn)
		s.hWaveIn = 0
	}
	if s.hWaveOut != 0 {
		_procWaveOutReset.Call(s.hWaveOut)
		_procWaveOutClose.Call(s.hWaveOut)
		s.hWaveOut = 0
	}

	_callbackMu.Lock()
	delete(_callbackData, s.id)
	_callbackMu.Unlock()

	s.playWg.Wait()
	return nil
}

func _utf16ToString(p *byte) string {
	var s []uint16
	for i := 0; i < 128; i++ {
		ch := *(*uint16)(unsafe.Pointer(uintptr(unsafe.Pointer(p)) + uintptr(i)*2))
		if ch == 0 {
			break
		}
		s = append(s, ch)
	}
	return string(utf16ToRunes(s))
}

func utf16ToRunes(s []uint16) []rune {
	out := make([]rune, 0, len(s))
	for i := 0; i < len(s); i++ {
		r := rune(s[i])
		if r >= 0xD800 && r <= 0xDBFF && i+1 < len(s) {
			r2 := rune(s[i+1])
			if r2 >= 0xDC00 && r2 <= 0xDFFF {
				r = (r-0xD800)*0x400 + (r2 - 0xDC00) + 0x10000
				i++
			}
		}
		out = append(out, r)
	}
	return out
}
