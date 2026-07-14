//go:build windows && (!cgo || no_qsv)

package capture

func newQSVD3D11TextureBackend() h264D3D11TextureBackend { return nil }
func probeQSVD3D11() (bool, string)                      { return false, "Intel Quick Sync requires a Windows CGO build" }
