//go:build !cgo && !windows

package capture

import (
	"errors"
	"image"
)

func encodeH264Frame(_ *image.RGBA) ([]byte, error) {
	return nil, errors.New("h264 support not available (cgo disabled)")
}

func h264Available() bool {
	return false
}

func h264AvailabilityDetail() string {
	return "cgo disabled in this build"
}

func resetH264Encoder() {}

func RequestDesktopH264Keyframe() {}

func resetH264Encoderbackstage() {}

func encodeH264Framebackstage(_ *image.RGBA) ([]byte, error) {
	return nil, errors.New("h264 support not available (cgo disabled)")
}

func encodeH264FrameWebcam(_ *image.RGBA) ([]byte, error) {
	return nil, errors.New("h264 support not available (cgo disabled)")
}

func SetH264TargetFPS(_ int) {}
