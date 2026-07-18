# Goylord-Client

Cross-platform agent binary written in **Go** that runs on target machines. Connects to the Goylord server via WebSocket and provides remote access capabilities.

**Version:** 0.0.5

## Directory Layout

```
Goylord-Client/
├── go.mod                           # Module: goylord-client, Go 1.26
├── cmd/agent/
│   ├── main.go                      # Entry point: config, persistence, mutex, reconnect loop
│   ├── session.go                   # WS session lifecycle: TLS, enrollment, hello, ping/pong, failover
│   ├── capture.go                   # Screen capture loop
│   ├── capture/
│   │   ├── h264_encoder_windows.go      # Windows H264 encoder (MF/NVENC/AMF)
│   │   ├── h264_bitrate.go             # H264 bitrate management (SetH264TargetBitrate, auto bitrate, CRF)
│   │   ├── h264_bitrate_reset_other.go  # Non-Windows stub for resetH264TextureEncoderForBitrate
│   │   ├── h264_bitrate_reset_windows.go # Windows stub calling resetH264D3D11TextureEncoder
│   │   ├── h264_bitrate_test.go         # Tests for bitrate calculation
│   │   └── stream_stats.go             # startStreamStatsReporting goroutine (desktop_stream_stats every 500ms)
│   ├── self_embed.go                # Self-embedding for shellcode persistence
│   ├── crashlog.go                  # Crash logging and reporting
│   ├── config/
│   │   └── config.go                # Agent configuration (AgentVersion = "0.0.5")
│   ├── handlers/
│   │   ├── command.go               # Command execution (cmd/sh, bash)
│   │   ├── files.go                # File browsing, upload, download
│   │   ├── processes.go               # Process listing, killing
│   │   ├── screenshot.go            # Screenshot capture
│   │   ├── desktop.go               # Remote desktop (mouse, keyboard, screen)
│   │   ├── backstage.go                  # HVNC (hidden VNC) management
│   │   ├── webcam.go                # Webcam capture
│   │   ├── keylogger.go             # Keystroke logging
│   │   ├── clipboard_sync_windows.go # Clipboard sync
│   │   ├── clipboard_sync_stub.go    # Clipboard sync (non-Windows)
│   │   ├── webrtc.go                # WebRTC P2P streaming
│   │   ├── plugin_load.go           # Plugin loading
│   │   ├── plugin_event.go          # Plugin events
│   │   ├── agent_update.go          # Agent self-update
│   │   ├── elevate_windows.go       # Privilege escalation (UAC bypass)
│   │   ├── elevate_other.go         # Privilege escalation (non-Windows stub)
│   │   ├── socks5.go                # SOCKS5 proxy
│   │   ├── silent_exec_windows.go   # Silent execution (Windows)
│   │   ├── silent_exec_unix.go      # Silent execution (Unix)
│   │   └── ping.go                  # Ping/pong heartbeat
│   ├── wire/
│   │   ├── codec.go                 # Binary protocol codec (msgpack-based)
│   │   ├── protocol.go              # Wire types: DesktopStreamStats, FrameHeader.Width/Height
│   │   └── writer.go                # Safe concurrent WebSocket writer
│   ├── sysinfo/
│   │   └── sysinfo.go               # System info: CPU, GPU, RAM, battery, admin status, OS
│   ├── keylogger/
│   │   └── keylogger.go             # Platform-specific keylogger implementations
│   ├── persistence/
│   │   └── persistence.go           # Persistence mechanisms (registry, startup, etc.)
│   ├── plugins/
│   │   └── wasm_runtime.go               # WASM plugin runtime (wazero)
│   ├── webrtcpub/
│   │   ├── state.go                 # Writer registry, Options (incl. ICEServers), ICECandidate
│   │   ├── whip_pion.go             # WebRTC publishing: WHIP relay via MediaMTX
│   │   ├── p2p_pion.go              # WebRTC P2P direct streaming
│   │   ├── audio_opus.go            # Opus 48kHz stereo audio encoder (build tag: goylord_webrtc)
│   │   └── audio_opus_test.go       # Opus encode/decode test
│   ├── activewindow/
│   │   └── activewindow.go          # Active window detection, clipboard monitoring
│   ├── criticalproc/
│   │   └── criticalproc.go          # Windows critical process protection
│   └── mutex/
│       └── mutex.go                 # Single-instance mutex
├── capture/                         # Capture backends
│   └── backstage_inject_windows.go  # HVNC injection (v2.5.2 memory fix)
└── third_party/
    └── nvcodec/
        └── nvEncodeAPI.h            # NVIDIA NVENC SDK header
```

## Supported Platforms

| OS | Architectures | Notes |
|---|---|---|
| Windows | amd64, 386, arm64 | Full support: HVNC, critical process, UAC bypass, NVENC/AMF |
| Linux | amd64, arm64, armv7 | Screenshot capture (xgb), persistence |
| macOS | amd64, arm64 | Screenshot, camera, permissions |
| FreeBSD | amd64 | Basic support |
| Android | arm64 | Basic support |
| iOS | arm64 | Basic support |
| OpenBSD | amd64 | Basic support |

## Build Tags

- `obf` — Enable garble obfuscation + control flow flattening
- `codeobf` — Custom string obfuscation
- `nvenc` — NVIDIA NVENC hardware encoding
- `amf` — AMD AMF hardware encoding
- `mf` — Media Foundation async H264
- `goylord_webrtc` — Opus audio encoding for WebRTC streaming

## Key Capabilities

- **Remote Desktop**: Screen capture → JPEG/H264 → WebSocket → server → browser
- **HVNC**: Hidden desktop via reflective DLL injection (BackstageInjection + BackstageCapture)
- **File Browser**: Browse, upload, download files with directory listing
- **Process Manager**: List/kill running processes
- **Command Execution**: Interactive shell (cmd.exe/bash) + one-shot commands
- **Keylogger**: Platform-specific keystroke capture
- **Webcam**: Camera capture with H264 encoding
- **Clipboard Sync**: Bidirectional clipboard synchronization
- **WebRTC**: P2P streaming via Pion (audio: Opus 48kHz stereo, PCMU fallback), server-provided TURN/STUN ICE servers
- **Privilege Escalation**: Windows UAC bypass, macOS/Linux sudo
- **Persistence**: Registry, startup items, WinRE
- **Self-Update**: Agent can update itself from server
- **SOCKS5 Proxy**: Tunnel traffic through agent
- **WASM Plugins**: Sandboxed plugin execution via wazero
- **Multi-Server Failover**: Rotate through server URLs with exponential backoff
- **Solana Discovery**: Resolve server URLs from Solana blockchain memos
- **Voice Capture**: winmm.dll waveIn/waveOut APIs (pure Go, no COM)
- **H264 Bitrate Management**: Dynamic bitrate/CRF adjustment, auto-bitrate with network-aware scaling
- **Stream Stats Reporting**: Goroutine reports desktop_stream_stats every 500ms (frame rate, bitrate, resolution)

## Go Dependencies

| Module | Purpose |
|---|---|
| nhooyr.io/websocket | WebSocket client |
| pion/webrtc/v4 | WebRTC (P2P streaming, ICE, SDP) |
| tetratelabs/wazero | WASM runtime (plugin sandbox) |
| kbinani/screenshot | Screen capture |
| vmihailenco/msgpack | Binary serialization |
| golang.org/x/crypto | Ed25519 enrollment crypto |
| lxn/win (Windows) | Win32 API bindings |
| jezek/xgb (Linux) | X11 screen capture |
| gen2brain/malgo (macOS) | Audio capture |
| Kirizu-Official/windows-camera-go | Windows camera capture |
| xmtp/go-codec (Opus) | Opus 48kHz stereo audio encoding for WebRTC |
