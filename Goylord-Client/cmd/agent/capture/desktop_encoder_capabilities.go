package capture

type DesktopEncoderProfile struct {
	MaxHeight int      `msgpack:"maxHeight" json:"maxHeight"`
	Width     int      `msgpack:"width" json:"width"`
	Height    int      `msgpack:"height" json:"height"`
	FPS       int      `msgpack:"fps" json:"fps"`
	Label     string   `msgpack:"label" json:"label"`
	Providers []string `msgpack:"providers" json:"providers"`
}

type DesktopEncoderCapabilities struct {
	Probed   bool                    `msgpack:"probed" json:"probed"`
	Display  int                     `msgpack:"display" json:"display"`
	Profiles []DesktopEncoderProfile `msgpack:"profiles" json:"profiles"`
	Detail   string                  `msgpack:"detail,omitempty" json:"detail,omitempty"`
}
