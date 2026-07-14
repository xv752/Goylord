package config

import (
	"net/http"
	"strings"
	"testing"
)

func TestValidateRPCResponseHonorsRateLimit(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusTooManyRequests,
		Status:     "429 Too Many Requests",
		Header:     http.Header{"Retry-After": []string{"17"}},
		Body:       http.NoBody,
	}
	err := validateRPCResponse(resp)
	if err == nil || !strings.Contains(err.Error(), "17s") {
		t.Fatalf("expected retry-after error, got %v", err)
	}
}

func TestValidateRPCResponseRejectsServerError(t *testing.T) {
	resp := &http.Response{
		StatusCode: http.StatusServiceUnavailable,
		Status:     "503 Service Unavailable",
		Header:     make(http.Header),
		Body:       http.NoBody,
	}
	if err := validateRPCResponse(resp); err == nil {
		t.Fatal("expected non-2xx response to fail")
	}
}

func TestShortSignatureHandlesMalformedValue(t *testing.T) {
	if got := shortSignature("short"); got != "short" {
		t.Fatalf("shortSignature returned %q", got)
	}
}
