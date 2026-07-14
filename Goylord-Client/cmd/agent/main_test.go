package main

import (
	"testing"
	"time"

	rt "goylord-client/cmd/agent/runtime"

	"nhooyr.io/websocket"
)

func TestMinDuration(t *testing.T) {
	if got := rt.MinDuration(1*time.Second, 5*time.Second); got != 1*time.Second {
		t.Fatalf("expected shorter duration returned, got %s", got)
	}
	if got := rt.MinDuration(5*time.Second, 1*time.Second); got != 1*time.Second {
		t.Fatalf("expected shorter duration returned, got %s", got)
	}
}

func TestIsSupersededError(t *testing.T) {
	if !isSupersededError(&websocket.CloseError{Code: supersededCloseCode, Reason: "superseded"}) {
		t.Fatal("expected close code 4004 to be treated as superseded")
	}
	if !isSupersededError(&websocket.CloseError{Code: websocket.StatusNormalClosure, Reason: "superseded"}) {
		t.Fatal("expected superseded reason to be treated as superseded")
	}
	if isSupersededError(&websocket.CloseError{Code: websocket.StatusNormalClosure, Reason: "bye"}) {
		t.Fatal("normal closure should not be treated as superseded")
	}
}
