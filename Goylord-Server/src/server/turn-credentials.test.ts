import { describe, expect, it } from "bun:test";
import { buildTurnIceServers, issueTurnIceServers } from "./turn-credentials";
import type { GoylordIceServer } from "./turn-credentials";

describe("buildTurnIceServers", () => {
  const config = {
    host: "turn.example.com",
    port: 3478,
    realm: "test",
    secret: "supersecret",
    ttlSeconds: 3600,
  };

  it("returns STUN + TURN entries", () => {
    const servers = buildTurnIceServers(config, "test-peer", 1000000000000);
    expect(servers.length).toBe(2);
    expect(servers[0].urls).toEqual(["stun:turn.example.com:3478"]);
    expect(servers[0].username).toBeUndefined();
    expect(servers[1].urls).toEqual([
      "turn:turn.example.com:3478?transport=udp",
      "turn:turn.example.com:3478?transport=tcp",
    ]);
    expect(servers[1].username).toContain("test-peer");
    expect(servers[1].credential!.length).toBeGreaterThan(0);
  });

  it("sanitizes identity in username", () => {
    const servers = buildTurnIceServers(config, "a:b/c@!", 1000000000000);
    expect(servers[1].username).toContain("a_b_c__");
  });

  it("truncates long identity", () => {
    const long = "x".repeat(200);
    const servers = buildTurnIceServers(config, long, 1000000000000);
    expect(servers[1].username!.length).toBeLessThan(200);
  });

  it("username includes correct expiry timestamp", () => {
    const nowMs = 1700000000000;
    const servers = buildTurnIceServers(config, "peer", nowMs);
    const expectedExpiry = Math.floor(nowMs / 1000) + config.ttlSeconds;
    expect(servers[1].username).toMatch(new RegExp(`^${expectedExpiry}:peer$`));
  });
});

describe("issueTurnIceServers", () => {
  it("returns empty array when GOYLORD_TURN_HOST is not set", () => {
    delete process.env.GOYLORD_TURN_HOST;
    delete process.env.GOYLORD_TURN_SECRET;
    const result = issueTurnIceServers("test-peer");
    expect(result).toEqual([]);
  });

  it("returns empty array when GOYLORD_TURN_SECRET is not set", () => {
    process.env.GOYLORD_TURN_HOST = "turn.example.com";
    delete process.env.GOYLORD_TURN_SECRET;
    const result = issueTurnIceServers("test-peer");
    expect(result).toEqual([]);
  });

  it("returns TURN servers when env vars are set", () => {
    process.env.GOYLORD_TURN_HOST = "turn.example.com";
    process.env.GOYLORD_TURN_SECRET = "mysecret";
    const result = issueTurnIceServers("peer-id");
    expect(result.length).toBe(2);
    expect(result[0].urls).toEqual(["stun:turn.example.com:3478"]);
    expect(result[1].username).toContain("peer-id");
    delete process.env.GOYLORD_TURN_HOST;
    delete process.env.GOYLORD_TURN_SECRET;
  });
});
