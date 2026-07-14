//go:build windows && (!cgo || no_amf)

package capture

func newAMFD3D11TextureBackend() h264D3D11TextureBackend { return nil }

func probeAMFD3D11() (bool, string) { return false, "AMD AMF requires a Windows CGO build" }
