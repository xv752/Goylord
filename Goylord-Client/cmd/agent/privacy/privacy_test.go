package privacy

import (
	"strconv"
	"testing"
)

func TestInputMarkerFitsPointerWidth(t *testing.T) {
	marker := InputMarker()
	if marker == 0 {
		t.Fatal("input marker must not be zero")
	}
	if strconv.IntSize == 32 && uint64(marker) != inputMarkerValue&0xffffffff {
		t.Fatalf("32-bit marker = %#x, want low bits %#x", marker, inputMarkerValue&0xffffffff)
	}
	if strconv.IntSize == 64 && uint64(marker) != inputMarkerValue {
		t.Fatalf("64-bit marker = %#x, want %#x", marker, inputMarkerValue)
	}
}
