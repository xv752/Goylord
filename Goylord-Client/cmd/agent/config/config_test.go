package config

import "testing"

func TestIsTruthy(t *testing.T) {
	tests := []struct {
		input string
		want  bool
	}{
		{"true", true},
		{"True", true},
		{"TRUE", true},
		{"1", true},
		{"yes", true},
		{"Yes", true},
		{"y", true},
		{"Y", true},
		{" true ", true},
		{"", false},
		{"false", false},
		{"0", false},
		{"no", false},
		{"n", false},
		{"random", false},
		{"2", false},
	}
	for _, tt := range tests {
		if got := isTruthy(tt.input); got != tt.want {
			t.Errorf("isTruthy(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestParseSleepSeconds(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"0", 0},
		{"1", 1},
		{"30", 30},
		{"3600", 3600},
		{"3601", 3600},
		{"99999", 3600},
		{"", 0},
		{"abc", 0},
		{"12ab", 0},
		{" 30 ", 30},
		{"007", 7},
	}
	for _, tt := range tests {
		if got := parseSleepSeconds(tt.input); got != tt.want {
			t.Errorf("parseSleepSeconds(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}

func TestFirstNonEmpty(t *testing.T) {
	tests := []struct {
		input []string
		want  string
	}{
		{[]string{"a", "b", "c"}, "a"},
		{[]string{"", "b", "c"}, "b"},
		{[]string{"", "", "c"}, "c"},
		{[]string{"", "", ""}, ""},
		{[]string{}, ""},
		{[]string{"  ", "b"}, "b"},
		{[]string{"a"}, "a"},
	}
	for _, tt := range tests {
		if got := firstNonEmpty(tt.input...); got != tt.want {
			t.Errorf("firstNonEmpty(%v) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestNormalizeServerURL(t *testing.T) {
	tests := []struct {
		input   string
		want    string
		wantErr bool
	}{
		{"wss://example.com:5173", "wss://example.com:5173", false},
		{"ws://example.com:5173", "ws://example.com:5173", false},
		{"https://example.com:5173", "wss://example.com:5173", false},
		{"http://example.com:5173", "ws://example.com:5173", false},
		{"example.com:5173", "wss://example.com:5173", false},
		{"example.com", "wss://example.com", false},
		{"https://example.com/path/", "wss://example.com/path", false},
		{"", "", false},
		{"  ", "", false},
		{"ftp://example.com", "", true},
	}
	for _, tt := range tests {
		got, err := normalizeServerURL(tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("normalizeServerURL(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			continue
		}
		if got != tt.want {
			t.Errorf("normalizeServerURL(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
