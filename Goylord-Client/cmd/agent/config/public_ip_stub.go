//go:build !fetch_public_ip

package config

func FetchPublicIPAddress() string { return "" }
