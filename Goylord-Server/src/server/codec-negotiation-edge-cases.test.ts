import { describe, expect, test } from "bun:test";
import { negotiateDesktopCodec, type DesktopCodecCapability } from "./desktop-codec-negotiation";

const fullEncoders: DesktopCodecCapability[] = [
  { codec: "hevc", transports: ["websocket"], hardware: true },
  { codec: "h264", transports: ["websocket", "webrtc"], hardware: true },
  { codec: "jpeg", transports: ["websocket"], hardware: false },
  { codec: "raw", transports: ["websocket"] },
];

describe("codec normalization aliases", () => {
  test("h265 alias normalizes to hevc", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "h265", transports: ["websocket"] }],
      decoderCodecs: ["h265"],
      preferredCodecs: ["h265"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("hevc");
    expect(result.fallbackCodecs).toEqual(["hevc"]);
  });

  test("mjpeg alias normalizes to jpeg", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "mjpeg", transports: ["websocket"] }],
      decoderCodecs: ["mjpeg"],
      preferredCodecs: ["mjpeg"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("jpeg");
    expect(result.fallbackCodecs).toEqual(["jpeg"]);
  });

  test("jpg alias normalizes to jpeg", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "jpg", transports: ["websocket"] }],
      decoderCodecs: ["jpg"],
      preferredCodecs: ["jpg"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("jpeg");
  });

  test("unknown codec name returns empty", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "av1", transports: ["websocket"] }],
      decoderCodecs: ["av1"],
      preferredCodecs: ["av1"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
    expect(result.fallbackCodecs).toEqual([]);
  });

  test("empty string codec is filtered out", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "", transports: ["websocket"] }],
      decoderCodecs: [""],
      preferredCodecs: [""],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
  });

  test("uppercase codec names are normalized to lowercase", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "HEVC", transports: ["websocket"] }],
      decoderCodecs: ["HEVC"],
      preferredCodecs: ["HEVC"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("hevc");
  });

  test("whitespace in codec name is trimmed", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "  h264  ", transports: ["websocket"] }],
      decoderCodecs: ["  h264  "],
      preferredCodecs: ["  h264  "],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
  });
});

describe("transport normalization", () => {
  test("'webrtc' maps to webrtc", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "webrtc",
    });
    expect(result.transport).toBe("webrtc");
  });

  test("'relayed' maps to webrtc", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "relayed",
    });
    expect(result.transport).toBe("webrtc");
  });

  test("'p2p' maps to webrtc", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "p2p",
    });
    expect(result.transport).toBe("webrtc");
  });

  test("'websocket' stays websocket", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.transport).toBe("websocket");
  });

  test("empty transport defaults to websocket", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "",
    });
    expect(result.transport).toBe("websocket");
  });

  test("undefined transport defaults to websocket", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
    });
    expect(result.transport).toBe("websocket");
  });

  test("random string transport defaults to websocket", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "QUIC",
    });
    expect(result.transport).toBe("websocket");
  });
});

describe("encoder codec filtering by transport", () => {
  test("hevc-only encoder is excluded when transport is webrtc (no webrtc transport declared)", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "hevc", transports: ["websocket"] },
        { codec: "jpeg", transports: ["websocket"] },
      ],
      decoderCodecs: ["hevc", "jpeg"],
      preferredCodecs: ["hevc", "jpeg"],
      transport: "webrtc",
    });
    expect(result.selectedCodec).toBe("");
    expect(result.fallbackCodecs).toEqual([]);
  });

  test("h264 encoder with webrtc transport is selected for webrtc negotiation", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "h264", transports: ["websocket", "webrtc"] },
        { codec: "jpeg", transports: ["websocket"] },
      ],
      decoderCodecs: ["h264", "jpeg"],
      preferredCodecs: ["h264", "jpeg"],
      transport: "webrtc",
    });
    expect(result.selectedCodec).toBe("h264");
  });

  test("encoder with no transports array defaults to websocket only", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "h264" }],
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
  });

  test("encoder with no transports defaults to websocket — excluded for webrtc", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "h264" }],
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "webrtc",
    });
    expect(result.selectedCodec).toBe("");
  });
});

describe("default preference when no preferredCodecs provided", () => {
  test("uses default preference [h264, jpeg, raw] when preferredCodecs is empty", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["jpeg", "raw"],
      preferredCodecs: [],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("jpeg");
    expect(result.fallbackCodecs).toEqual(["jpeg", "raw"]);
  });

  test("uses default preference when preferredCodecs is undefined", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
    expect(result.fallbackCodecs).toEqual(["h264"]);
  });

  test("uses default preference when preferredCodecs is null", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["jpeg"],
      preferredCodecs: null,
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("jpeg");
  });
});

describe("edge case inputs", () => {
  test("null encoderCodecs", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: null,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
    expect(result.fallbackCodecs).toEqual([]);
  });

  test("null decoderCodecs", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: null,
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
  });

  test("non-array encoderCodecs string", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: "h264" as any,
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
  });

  test("encoder with non-string non-object entries are skipped", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [42, true, null, { codec: "h264", transports: ["websocket"] }],
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
  });

  test("completely empty inputs", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [],
      decoderCodecs: [],
      preferredCodecs: [],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
    expect(result.fallbackCodecs).toEqual([]);
  });
});

describe("duplicate codec handling", () => {
  test("duplicate preferredCodecs are deduplicated", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: fullEncoders,
      decoderCodecs: ["h264", "jpeg"],
      preferredCodecs: ["h264", "h264", "h264", "jpeg"],
      transport: "websocket",
    });
    expect(result.fallbackCodecs).toEqual(["h264", "jpeg"]);
  });

  test("duplicate encoder entries with same codec are collapsed", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "h264", transports: ["websocket"] },
        { codec: "h264", transports: ["webrtc"] },
      ],
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
    expect(result.fallbackCodecs).toEqual(["h264"]);
  });
});

describe("fallback chain ordering", () => {
  test("fallback list preserves preference order, not encoder order", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "jpeg", transports: ["websocket"] },
        { codec: "h264", transports: ["websocket"] },
        { codec: "hevc", transports: ["websocket"] },
      ],
      decoderCodecs: ["jpeg", "h264", "hevc"],
      preferredCodecs: ["hevc", "h264", "jpeg"],
      transport: "websocket",
    });
    expect(result.fallbackCodecs).toEqual(["hevc", "h264", "jpeg"]);
  });

  test("only codecs present in both encoder and decoder appear in fallback", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "hevc", transports: ["websocket"] }],
      decoderCodecs: ["hevc", "h264", "jpeg"],
      preferredCodecs: ["hevc", "h264", "jpeg"],
      transport: "websocket",
    });
    expect(result.fallbackCodecs).toEqual(["hevc"]);
  });

  test("no decoder match returns empty fallback", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [{ codec: "h264", transports: ["websocket"] }],
      decoderCodecs: ["av1", "vp9"],
      preferredCodecs: ["h264", "av1", "vp9"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("");
    expect(result.fallbackCodecs).toEqual([]);
  });
});

describe("hardware flag passthrough", () => {
  test("hardware flag on encoder capability does not affect codec selection", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "hevc", transports: ["websocket"], hardware: true },
      ],
      decoderCodecs: ["hevc"],
      preferredCodecs: ["hevc"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("hevc");
  });

  test("software encoder is still selectable", () => {
    const result = negotiateDesktopCodec({
      encoderCodecs: [
        { codec: "h264", transports: ["websocket"], hardware: false },
      ],
      decoderCodecs: ["h264"],
      preferredCodecs: ["h264"],
      transport: "websocket",
    });
    expect(result.selectedCodec).toBe("h264");
  });
});
