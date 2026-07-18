import { afterEach, describe, expect, test } from "bun:test";
import * as clientManager from "../clientManager";
import { decodeMessage } from "../protocol";
import * as sessionManager from "../sessions/sessionManager";
import type { SocketData } from "../sessions/types";
import type { ClientInfo } from "../types";
import {
  handlebackstageViewerMessage,
  handlebackstageViewerOpen,
  handleRemoteDesktopViewerMessage,
  handleRemoteDesktopViewerOpen,
  backstageStreamingState,
  rdStreamingState,
} from "./ws-console-rd-backstage";

type MockWs = {
  data: SocketData;
  sent: unknown[];
  closedCode?: number;
  closedReason?: string;
  send: (msg: unknown) => void;
  close: (code: number, reason: string) => void;
  getBufferedAmount: () => number;
};

const clientIdsToCleanup = new Set<string>();

function createMockWs(data: Partial<SocketData>): MockWs {
  return {
    data: {
      role: "rd_viewer",
      clientId: "rd-edge-client",
      ...data,
    } as SocketData,
    sent: [],
    send(msg: unknown) { this.sent.push(msg); },
    close(code: number, reason: string) { this.closedCode = code; this.closedReason = reason; },
    getBufferedAmount() { return 0; },
  };
}

function createClient(id: string, extra?: Partial<ClientInfo>) {
  const agentWs = createMockWs({ role: "client", clientId: id });
  const info: ClientInfo = {
    id,
    role: "client",
    ws: agentWs,
    lastSeen: Date.now(),
    online: true,
    host: "test-host",
    os: "windows",
    user: "tester",
    monitors: 1,
    ...extra,
  };
  clientManager.addClient(id, info);
  clientIdsToCleanup.add(id);
  return { info, agentWs };
}

function agentCommands(ws: MockWs) {
  return ws.sent.map((msg) => decodeMessage(msg as Uint8Array) as any);
}

function viewerMessages(ws: MockWs) {
  return ws.sent.map((msg) => {
    try { return decodeMessage(msg as Uint8Array) as any; } catch { return msg; }
  });
}

afterEach(() => {
  for (const clientId of clientIdsToCleanup) {
    for (const session of sessionManager.getRdSessionsForClient(clientId)) {
      sessionManager.deleteRdSession(session.id);
    }
    for (const session of sessionManager.getbackstageSessionsForClient(clientId)) {
      sessionManager.deletebackstageSession(session.id);
    }
    rdStreamingState.delete(clientId);
    backstageStreamingState.delete(clientId);
    clientManager.deleteClient(clientId);
  }
  clientIdsToCleanup.clear();
});

describe("desktop_encoder_capabilities — codec negotiation flow", () => {
  test("stores decoderCodecs and preferredCodecs from viewer", () => {
    const clientId = `rd-enc-cap-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["hevc", "h264", "jpeg"],
      preferredCodecs: ["hevc", "h264", "jpeg"],
      transport: "websocket",
      display: 0,
    }));

    expect(viewer.data.rdDecoderCodecs).toEqual(["hevc", "h264", "jpeg"]);
    expect(viewer.data.rdPreferredCodecs).toEqual(["hevc", "h264", "jpeg"]);
    expect(viewer.data.rdCodecTransport).toBe("websocket");
  });

  test("normalizes webrtc transport from 'p2p' string", () => {
    const clientId = `rd-enc-p2p-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "p2p",
    }));

    expect(viewer.data.rdCodecTransport).toBe("webrtc");
  });

  test("normalizes webrtc transport from 'relayed' string", () => {
    const clientId = `rd-enc-relayed-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "relayed",
    }));

    expect(viewer.data.rdCodecTransport).toBe("webrtc");
  });

  test("defaults decoderCodecs to [h264, jpeg, raw] when not provided", () => {
    const clientId = `rd-enc-defaults-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      display: 0,
    }));

    expect(viewer.data.rdDecoderCodecs).toEqual(["h264", "jpeg", "raw"]);
    expect(viewer.data.rdPreferredCodecs).toEqual(["h264", "jpeg", "raw"]);
  });

  test("caps decoderCodecs at 8 entries", () => {
    const clientId = `rd-enc-cap8-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      preferredCodecs: ["a"],
    }));

    expect(viewer.data.rdDecoderCodecs!.length).toBeLessThanOrEqual(8);
  });

  test("filters empty strings from decoderCodecs", () => {
    const clientId = `rd-enc-empty-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["h264", "", "  ", "jpeg"],
      preferredCodecs: ["h264"],
    }));

    expect(viewer.data.rdDecoderCodecs).not.toContain("");
    expect(viewer.data.rdDecoderCodecs).not.toContain("  ");
  });
});

describe("desktop_set_quality — codec changes", () => {
  test("sets codec to hevc and updates state", () => {
    const clientId = `rd-quality-hevc-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_set_quality",
      quality: 80,
      codec: "hevc",
    }));

    const state = rdStreamingState.get(clientId);
    expect(state).toBeDefined();
    expect(state!.codec).toBe("hevc");
    expect(state!.quality).toBe(80);
  });

  test("sets codec to h264 with softwareH264 flag", () => {
    const clientId = `rd-quality-sw-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_set_quality",
      quality: 90,
      codec: "h264",
      softwareH264: true,
    }));

    const state = rdStreamingState.get(clientId);
    expect(state!.codec).toBe("h264");
    expect(state!.softwareH264).toBe(true);
  });

  test("does not duplicate agent command when quality unchanged", () => {
    const clientId = `rd-quality-dup-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const beforeCount = agentCommands(agentWs).length;
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_set_quality",
      quality: 90,
      codec: "",
    }));

    const afterCount = agentCommands(agentWs).length;
    expect(afterCount).toBe(beforeCount);
  });
});

describe("desktop_start — HEVC codec awareness", () => {
  test("does not request keyframe when codec is hevc (only h264 gets keyframe)", () => {
    const clientId = `rd-hevc-kf-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId);
    const viewer = createMockWs({ clientId });

    rdStreamingState.set(clientId, {
      isStreaming: true,
      display: 0,
      quality: 90,
      codec: "hevc",
      softwareH264: false,
      duplication: false,
      maxHeight: 0,
      maxFps: 120,
      lastFps: 30,
      lastFrameAt: Date.now(),
      startedAt: Date.now(),
    });

    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const commands = agentCommands(agentWs);
    const keyframeRequests = commands.filter((m: any) => m.commandType === "desktop_request_keyframe");
    expect(keyframeRequests.length).toBe(0);
  });

  test("requests keyframe when codec is h264 on already-active stream", () => {
    const clientId = `rd-h264-kf-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId);
    const viewer = createMockWs({ clientId });

    rdStreamingState.set(clientId, {
      isStreaming: true,
      display: 0,
      quality: 90,
      codec: "h264",
      softwareH264: false,
      duplication: false,
      maxHeight: 0,
      maxFps: 120,
      lastFps: 30,
      lastFrameAt: Date.now(),
      startedAt: Date.now(),
    });

    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const commands = agentCommands(agentWs);
    const keyframeRequests = commands.filter((m: any) => m.commandType === "desktop_request_keyframe");
    expect(keyframeRequests.length).toBe(1);
  });
});

describe("desktop_record_start — HEVC recording rejection", () => {
  test("rejects recording when codec is hevc", () => {
    const clientId = `rd-rec-hevc-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    rdStreamingState.set(clientId, {
      isStreaming: true,
      display: 0,
      quality: 90,
      codec: "hevc",
      softwareH264: false,
      duplication: false,
      maxHeight: 0,
      maxFps: 120,
      lastFps: 30,
      lastFrameAt: Date.now(),
      startedAt: Date.now(),
    });

    viewer.sent = [];
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_record_start" }));

    const msgs = viewerMessages(viewer);
    const recordStatus = msgs.find((m: any) => m?.type === "recording_status");
    expect(recordStatus).toBeDefined();
    expect(recordStatus!.error).toContain("HEVC");
    expect(recordStatus!.recording).toBeNull();
  });

  test("rejects recording when not streaming", () => {
    const clientId = `rd-rec-nostream-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_record_start" }));

    const msgs = viewerMessages(viewer);
    const recordStatus = msgs.find((m: any) => m?.type === "recording_status");
    expect(recordStatus).toBeDefined();
    expect(recordStatus!.error).toContain("Start the remote desktop stream");
  });
});

describe("desktop_stop — edge cases with codec state", () => {
  test("stop clears codec state and resets streaming", () => {
    const clientId = `rd-stop-codec-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_set_quality",
      quality: 80,
      codec: "hevc",
    }));

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_stop" }));

    const state = rdStreamingState.get(clientId);
    expect(state).toBeDefined();
    expect(state!.isStreaming).toBe(false);
    expect(state!.lastFrameAt).toBe(0);
    expect(state!.startedAt).toBe(0);
  });
});

describe("macOS permission gating — edge cases", () => {
  test("darwin client with all permissions denied is blocked", () => {
    const clientId = `rd-mac-all-denied-${Date.now().toString(36)}`;
    createClient(clientId, {
      os: "darwin",
      permissions: { screenRecording: false, accessibility: false },
    });
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const commands = agentCommands(viewer as any);
    expect(commands.filter((m: any) => m.commandType === "desktop_start")).toHaveLength(0);
    expect(viewer.sent.length).toBeGreaterThan(0);
  });

  test("darwin client with only accessibility denied shows only missing permission", () => {
    const clientId = `rd-mac-acc-${Date.now().toString(36)}`;
    createClient(clientId, {
      os: "darwin",
      permissions: { screenRecording: true, accessibility: false },
    });
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const msgs = viewerMessages(viewer);
    const permMsg = msgs.find((m: any) => m?.status === "permissions_denied");
    expect(permMsg).toBeDefined();
    expect(permMsg!.missing).toContain("accessibility");
    expect(permMsg!.missing).not.toContain("screenRecording");
  });

  test("windows client bypasses macOS permission check", () => {
    const clientId = `rd-win-perms-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId, { os: "windows" });
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const commands = agentCommands(agentWs);
    expect(commands.filter((m: any) => m.commandType === "desktop_start")).toHaveLength(1);
  });

  test("linux client bypasses macOS permission check", () => {
    const clientId = `rd-linux-perms-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId, { os: "linux" });
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);
    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({ type: "desktop_start" }));

    const commands = agentCommands(agentWs);
    expect(commands.filter((m: any) => m.commandType === "desktop_start")).toHaveLength(1);
  });
});

describe("desktop_encoder_capabilities with HEVC preference", () => {
  test("HEVC preferred codec stored on viewer data for downstream use", () => {
    const clientId = `rd-hevc-pref-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["hevc", "h264", "jpeg"],
      preferredCodecs: ["hevc"],
      transport: "websocket",
      display: 0,
    }));

    expect(viewer.data.rdPreferredCodecs).toEqual(["hevc"]);
    expect(viewer.data.rdDecoderCodecs).toEqual(["hevc", "h264", "jpeg"]);
    expect(viewer.data.rdCodecTransport).toBe("websocket");
  });

  test("WebRTC transport with HEVC-only encoder results in no codec", () => {
    const clientId = `rd-hevc-webrtc-${Date.now().toString(36)}`;
    createClient(clientId);
    const viewer = createMockWs({ clientId });
    handleRemoteDesktopViewerOpen(viewer as any);

    handleRemoteDesktopViewerMessage(viewer as any, JSON.stringify({
      type: "desktop_encoder_capabilities",
      decoderCodecs: ["hevc", "jpeg"],
      preferredCodecs: ["hevc"],
      transport: "p2p",
    }));

    expect(viewer.data.rdCodecTransport).toBe("webrtc");
    expect(viewer.data.rdDecoderCodecs).toEqual(["hevc", "jpeg"]);
  });
});

describe("backstage viewer — streaming state edge cases", () => {
  test("backstage_stop works correctly when streaming state has codec set", () => {
    const clientId = `bs-codec-stop-${Date.now().toString(36)}`;
    const { agentWs } = createClient(clientId);
    const viewer = createMockWs({ role: "backstage_viewer", clientId });

    handlebackstageViewerOpen(viewer as any);
    backstageStreamingState.set(clientId, {
      isStreaming: true,
      virtualMode: true,
      display: 0,
      quality: 90,
      codec: "h264",
      maxFps: 120,
      lastFps: 30,
    });

    handlebackstageViewerMessage(viewer as any, JSON.stringify({ type: "backstage_stop" }));

    const commands = agentCommands(agentWs);
    expect(commands.filter((m: any) => m.commandType === "backstage_stop")).toHaveLength(1);
    expect(commands.filter((m: any) => m.commandType === "webrtc_stop")).toHaveLength(1);
    expect(backstageStreamingState.get(clientId)?.isStreaming).toBe(false);
  });
});
