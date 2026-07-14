package handlers

import "testing"

func TestToInt(t *testing.T) {
	tests := []struct {
		name string
		val  interface{}
		want int
	}{
		{"nil", nil, 0},
		{"int", int(42), 42},
		{"int8", int8(42), 42},
		{"int16", int16(42), 42},
		{"int32", int32(42), 42},
		{"int64", int64(42), 42},
		{"uint8", uint8(42), 42},
		{"uint16", uint16(42), 42},
		{"uint32", uint32(42), 42},
		{"uint64", uint64(42), 42},
		{"float64", float64(42.7), 42},
		{"string", "42", 0},
		{"bool", true, 0},
		{"negative int", int(-5), -5},
		{"zero", int(0), 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := toInt(tt.val); got != tt.want {
				t.Errorf("toInt(%v) = %d, want %d", tt.val, got, tt.want)
			}
		})
	}
}

func TestUploadKey(t *testing.T) {
	tests := []struct {
		path       string
		transferID string
		want       string
	}{
		{"C:\\file.txt", "abc-123", "abc-123"},
		{"C:\\file.txt", "", "C:\\file.txt"},
		{"/home/user/file.txt", "", "/home/user/file.txt"},
		{"/home/user/file.txt", "xyz", "xyz"},
	}
	for _, tt := range tests {
		if got := uploadKey(tt.path, tt.transferID); got != tt.want {
			t.Errorf("uploadKey(%q, %q) = %q, want %q", tt.path, tt.transferID, got, tt.want)
		}
	}
}

func TestClampDesktopTargetFPS(t *testing.T) {
	tests := []struct {
		input int
		want  int
	}{
		{-1, 1},
		{0, 1},
		{1, 1},
		{30, 30},
		{60, 60},
		{120, 120},
		{240, 240},
		{241, 240},
		{1000, 240},
	}
	for _, tt := range tests {
		if got := clampDesktopTargetFPS(tt.input); got != tt.want {
			t.Errorf("clampDesktopTargetFPS(%d) = %d, want %d", tt.input, got, tt.want)
		}
	}
}
