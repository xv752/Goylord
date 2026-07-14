import { describe, expect, test, beforeAll, beforeEach } from "bun:test";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let signBuildToken: typeof import("./build-signing").signBuildToken;
let verifyBuildToken: typeof import("./build-signing").verifyBuildToken;
let isBuildBanned: typeof import("./build-signing").isBuildBanned;
let addBuildToBanlist: typeof import("./build-signing").addBuildToBanlist;
let removeBuildFromBanlist: typeof import("./build-signing").removeBuildFromBanlist;
let resetCache: () => void;

beforeAll(async () => {
  process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "goylord-build-signing-test-"));
  const mod = await import("./build-signing");
  signBuildToken = mod.signBuildToken;
  verifyBuildToken = mod.verifyBuildToken;
  isBuildBanned = mod.isBuildBanned;
  addBuildToBanlist = mod.addBuildToBanlist;
  removeBuildFromBanlist = mod.removeBuildFromBanlist;
  resetCache = mod.resetBuildSigningCacheForTests;
});

describe("build-signing", () => {
  test("sign/verify roundtrip preserves payload", async () => {
    const payload = { v: 1 as const, bid: "build-abc-123", uid: 42, iat: 1700000000 };
    const token = await signBuildToken(payload);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const verified = await verifyBuildToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.v).toBe(1);
    expect(verified!.bid).toBe("build-abc-123");
    expect(verified!.uid).toBe(42);
    expect(verified!.iat).toBe(1700000000);
  });

  test("sign/verify works with null uid", async () => {
    const payload = { v: 1 as const, bid: "build-no-owner", uid: null, iat: 1700000001 };
    const token = await signBuildToken(payload);
    const verified = await verifyBuildToken(token);
    expect(verified).not.toBeNull();
    expect(verified!.uid).toBe(null);
  });

  test("tampered payload fails verification", async () => {
    const token = await signBuildToken({ v: 1, bid: "real-build", uid: 1, iat: 1700000000 });
    const [payloadB64, sigB64] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ v: 1, bid: "evil-build", uid: 1, iat: 1700000000 }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(await verifyBuildToken(`${tamperedPayload}.${sigB64}`)).toBeNull();
  });

  test("tampered signature fails verification", async () => {
    const token = await signBuildToken({ v: 1, bid: "real-build", uid: 1, iat: 1700000000 });
    const [payloadB64] = token.split(".");
    const fakeSig = "A".repeat(86);
    expect(await verifyBuildToken(`${payloadB64}.${fakeSig}`)).toBeNull();
  });

  test("legacy UUID-style buildTag returns null (so DB fallback path triggers)", async () => {
    expect(await verifyBuildToken("550e8400-e29b-41d4-a716-446655440000")).toBeNull();
  });

  test("garbage input returns null", async () => {
    expect(await verifyBuildToken("")).toBeNull();
    expect(await verifyBuildToken("not-a-token")).toBeNull();
    expect(await verifyBuildToken(".")).toBeNull();
    expect(await verifyBuildToken("a.")).toBeNull();
    expect(await verifyBuildToken(".b")).toBeNull();
  });

  test("payload missing required fields returns null", async () => {
    const badPayloadB64 = Buffer.from(JSON.stringify({ hello: "world" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(await verifyBuildToken(`${badPayloadB64}.AAAA`)).toBeNull();
  });

  test("token signed with a different key fails verification", async () => {
    const token = await signBuildToken({ v: 1, bid: "build-x", uid: 1, iat: 1700000000 });
    const verifiedFirst = await verifyBuildToken(token);
    expect(verifiedFirst).not.toBeNull();

    process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "goylord-build-signing-test-rotated-"));
    resetCache();

    expect(await verifyBuildToken(token)).toBeNull();
  });

  test("banlist add/remove/check", () => {
    expect(isBuildBanned("nope")).toBe(false);
    addBuildToBanlist("ban-me");
    expect(isBuildBanned("ban-me")).toBe(true);
    addBuildToBanlist("ban-me");
    expect(isBuildBanned("ban-me")).toBe(true);
    removeBuildFromBanlist("ban-me");
    expect(isBuildBanned("ban-me")).toBe(false);
    removeBuildFromBanlist("ban-me");
    expect(isBuildBanned("ban-me")).toBe(false);
  });
});
