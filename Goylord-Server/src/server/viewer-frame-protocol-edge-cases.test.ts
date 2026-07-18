import { describe, expect, test } from "bun:test";
import { decode as msgpackDecode } from "@msgpack/msgpack";
import {
  buildViewerFrameBuffer,
  safeSendViewerFrame,
  decodeViewerPayload,
  safeSendViewer,
} from "./ws-viewer-utils";

describe("buildViewerFrameBuffer — format byte mapping", () => {
  test("format 'jpeg' maps to format byte 1", () => {
    const payload = new Uint8Array([0xDE, 0xAD]);
    const frame = buildViewerFrameBuffer(payload, { format: "jpeg", monitor: 0, fps: 30 });
    expect(frame[6]).toBe(1);
  });

  test("format 'blocks' maps to format byte 2", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { format: "blocks" });
    expect(frame[6]).toBe(2);
  });

  test("format 'blocks_raw' maps to format byte 3", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { format: "blocks_raw" });
    expect(frame[6]).toBe(3);
  });

  test("format 'h264' maps to format byte 4", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { format: "h264" });
    expect(frame[6]).toBe(4);
  });

  test("format 'hevc' maps to format byte 5", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { format: "hevc" });
    expect(frame[6]).toBe(5);
  });

  test("no format / unknown format defaults to format byte 1 (jpeg)", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { monitor: 0, fps: 60 });
    expect(frame[6]).toBe(1);
  });

  test("empty header defaults to format byte 1", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]));
    expect(frame[6]).toBe(1);
  });

  test("unknown format string 'vp9' defaults to format byte 1", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([1]), { format: "vp9" });
    expect(frame[6]).toBe(1);
  });
});

describe("buildViewerFrameBuffer — header structure", () => {
  test("magic bytes are 0x46 0x52 0x4d ('FRM')", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]));
    expect(frame[0]).toBe(0x46);
    expect(frame[1]).toBe(0x52);
    expect(frame[2]).toBe(0x4d);
  });

  test("version byte is 1", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]));
    expect(frame[3]).toBe(1);
  });

  test("monitor byte is clamped to 0xff", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]), { monitor: 256 });
    expect(frame[4]).toBe(0);
  });

  test("monitor byte wraps for large values", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]), { monitor: 300 });
    expect(frame[4]).toBe(300 & 0xff);
  });

  test("fps byte is clamped to 0xff", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]), { fps: 256 });
    expect(frame[5]).toBe(0);
  });

  test("fps 144 wraps to 144 & 0xff", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]), { fps: 144 });
    expect(frame[5]).toBe(144);
  });

  test("reserved byte at index 7 is always 0", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array([0]));
    expect(frame[7]).toBe(0);
  });

  test("header is always 8 bytes regardless of payload size", () => {
    const small = buildViewerFrameBuffer(new Uint8Array([1]));
    const large = buildViewerFrameBuffer(new Uint8Array(10000));
    expect(small.length).toBe(8 + 1);
    expect(large.length).toBe(8 + 10000);
  });
});

describe("buildViewerFrameBuffer — payload concatenation", () => {
  test("payload bytes are placed after 8-byte header", () => {
    const payload = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD]);
    const frame = buildViewerFrameBuffer(payload);
    expect(frame.slice(8)).toEqual(payload);
  });

  test("empty payload produces exactly 8-byte frame", () => {
    const frame = buildViewerFrameBuffer(new Uint8Array(0));
    expect(frame.length).toBe(8);
  });

  test("large 1MB payload is correctly concatenated", () => {
    const payload = new Uint8Array(1024 * 1024);
    payload[0] = 0xFF;
    payload[payload.length - 1] = 0x01;
    const frame = buildViewerFrameBuffer(payload);
    expect(frame.length).toBe(8 + payload.length);
    expect(frame[8]).toBe(0xFF);
    expect(frame[frame.length - 1]).toBe(0x01);
  });

  test("HEVC NAL unit payload is correctly appended", () => {
    const nalHeader = new Uint8Array([0, 0, 0, 1, 0x40, 0x01, 0x18, 0x90]);
    const frame = buildViewerFrameBuffer(nalHeader, { format: "hevc" });
    expect(frame[6]).toBe(5);
    expect(frame.slice(8)).toEqual(nalHeader);
  });
});

describe("decodeViewerPayload", () => {
  test("parses valid JSON string", () => {
    const result = decodeViewerPayload('{"type":"desktop_start"}');
    expect(result).toEqual({ type: "desktop_start" });
  });

  test("parses JSON string with nested objects", () => {
    const result = decodeViewerPayload('{"header":{"monitor":0,"fps":60},"data":[1,2,3]}');
    expect(result).toEqual({ header: { monitor: 0, fps: 60 }, data: [1, 2, 3] });
  });

  test("returns null for invalid JSON string", () => {
    expect(decodeViewerPayload("not json at all")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(decodeViewerPayload("")).toBeNull();
  });

  test("returns null for malformed JSON", () => {
    expect(decodeViewerPayload("{unclosed")).toBeNull();
  });

  test("decodes valid msgpack binary", () => {
    const { encode } = require("@msgpack/msgpack");
    const obj = { type: "desktop_quality", quality: 75 };
    const encoded = encode(obj);
    const result = decodeViewerPayload(encoded);
    expect(result.type).toBe("desktop_quality");
    expect(result.quality).toBe(75);
  });

  test("decodes Uint8Array msgpack", () => {
    const { encode } = require("@msgpack/msgpack");
    const encoded = encode({ type: "test", value: 42 });
    const result = decodeViewerPayload(new Uint8Array(encoded));
    expect(result).toEqual({ type: "test", value: 42 });
  });

  test("returns null for invalid binary data", () => {
    expect(decodeViewerPayload(new Uint8Array([0xFF, 0xFE, 0xFD]))).toBeNull();
  });

  test("returns null for empty ArrayBuffer", () => {
    expect(decodeViewerPayload(new ArrayBuffer(0))).toBeNull();
  });
});

describe("safeSendViewerFrame", () => {
  test("sends binary frame and returns bytes sent", () => {
    const sent: any[] = [];
    const ws = { send: (data: any) => sent.push(data) } as any;
    const bytes = safeSendViewerFrame(ws, new Uint8Array([1, 2, 3]), { format: "jpeg" });
    expect(bytes).toBe(11);
    expect(sent.length).toBe(1);
  });

  test("returns 0 when send throws", () => {
    const ws = { send: () => { throw new Error("gone"); } } as any;
    expect(safeSendViewerFrame(ws, new Uint8Array([1]), {})).toBe(0);
  });

  test("returns bytes for HEVC frame", () => {
    const sent: any[] = [];
    const ws = { send: (data: any) => sent.push(data) } as any;
    const nal = new Uint8Array([0, 0, 0, 1, 0x40, 0x01]);
    const bytes = safeSendViewerFrame(ws, nal, { format: "hevc", monitor: 0, fps: 60 });
    expect(bytes).toBe(8 + nal.length);
    const frame = sent[0] as Uint8Array;
    expect(frame[6]).toBe(5);
  });

  test("handles zero-length payload", () => {
    const sent: any[] = [];
    const ws = { send: (data: any) => sent.push(data) } as any;
    const bytes = safeSendViewerFrame(ws, new Uint8Array(0), { format: "h264" });
    expect(bytes).toBe(8);
  });

  test("safeSendViewer sends msgpack encoded payload", () => {
    const sent: any[] = [];
    const ws = { send: (data: any) => sent.push(data) } as any;
    safeSendViewer(ws, { type: "status", status: "online" });
    expect(sent.length).toBe(1);
    const decoded = msgpackDecode(sent[0]);
    expect(decoded).toEqual({ type: "status", status: "online" });
  });

  test("safeSendViewer does not throw when send fails", () => {
    const ws = { send: () => { throw new Error("socket closed"); } } as any;
    expect(() => safeSendViewer(ws, { type: "test" })).not.toThrow();
  });
});
