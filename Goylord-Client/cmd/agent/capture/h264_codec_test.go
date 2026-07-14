package capture

import (
	"image"
	"image/color"
	"os"
	"strings"
	"sync"
	"testing"
)

func resetCodecSelectionForTest() {
	blockCodecOnce = sync.Once{}
	cachedBlockCodec = ""
	overrideCodec.Store("")
}

func TestSetQualityAndCodec_H264FallbackDependsOnAvailability(t *testing.T) {
	t.Cleanup(resetCodecSelectionForTest)

	SetQualityAndCodec(80, "h264")
	got := blockCodec()

	if h264Available() {
		if got != "h264" {
			t.Fatalf("expected h264 codec when available, got %q", got)
		}
		return
	}

	if got != "jpeg" {
		t.Fatalf("expected jpeg fallback when h264 unavailable, got %q", got)
	}
}

func TestSetQualityAndCodec_InvalidCodecForcesJpeg(t *testing.T) {
	t.Cleanup(resetCodecSelectionForTest)

	SetQualityAndCodec(75, "invalid-codec")
	got := blockCodec()
	if got != "jpeg" {
		t.Fatalf("expected invalid codec to force jpeg, got %q", got)
	}
}

func TestH264AvailabilityDetail_NotEmpty(t *testing.T) {
	detail := strings.TrimSpace(h264AvailabilityDetail())
	if detail == "" {
		t.Fatal("expected h264 availability detail to be non-empty")
	}
}

func TestEncodeH264Frame_WhenUnavailableReturnsError(t *testing.T) {
	if h264Available() {
		t.Skip("h264 is available in this build; unavailable-path assertion does not apply")
	}

	img := image.NewRGBA(image.Rect(0, 0, 2, 2))
	out, err := encodeH264Frame(img)
	if err == nil {
		t.Fatal("expected an error when h264 is unavailable")
	}
	if out != nil {
		t.Fatalf("expected nil output when h264 is unavailable, got %d bytes", len(out))
	}
}

func TestEncodeH264Frame_WhenAvailableProducesBytes(t *testing.T) {
	if !h264Available() {
		t.Skip("h264 is unavailable in this build")
	}
	t.Cleanup(resetH264Encoder)

	img := image.NewRGBA(image.Rect(0, 0, 64, 64))
	var got []byte
	for frame := 0; frame < 8; frame++ {
		for y := 0; y < 64; y++ {
			for x := 0; x < 64; x++ {
				img.SetRGBA(x, y, color.RGBA{R: uint8(x*3 + frame*7), G: uint8(y * 3), B: uint8(80 + frame*11), A: 255})
			}
		}
		out, err := encodeH264Frame(img)
		if err != nil {
			t.Fatalf("encodeH264Frame failed: %v", err)
		}
		if len(out) > 0 {
			got = out
			break
		}
	}
	if len(got) == 0 {
		t.Fatal("expected h264 encoder to produce bytes")
	}
}

func TestBlockCodec_UsesEnvWhenNoOverride(t *testing.T) {
	prev := os.Getenv(blockCodecEnv)
	if err := os.Setenv(blockCodecEnv, "raw"); err != nil {
		t.Fatalf("setenv failed: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv(blockCodecEnv, prev)
		resetCodecSelectionForTest()
	})

	resetCodecSelectionForTest()
	got := blockCodec()
	if got != "raw" {
		t.Fatalf("expected env codec raw, got %q", got)
	}
}
