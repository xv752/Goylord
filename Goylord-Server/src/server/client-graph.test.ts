import { describe, expect, test } from "bun:test";
import { buildClientGraph, clientIpSubnet } from "./client-graph";

describe("client graph", () => {
  test("builds client relationship nodes and edges", () => {
    const graph = buildClientGraph([
      {
        id: "client-a",
        host: "alpha",
        user: "alice",
        os: "windows",
        ip: "10.20.30.40",
        country: "US",
        online: true,
        lastSeen: Date.now(),
        groupId: 7,
        groupName: "Ops",
        groupColor: "#38bdf8",
        buildTag: "prod-build",
      } as any,
      {
        id: "client-b",
        host: "beta",
        user: "alice",
        os: "windows",
        ip: "10.20.30.55",
        country: "US",
        online: false,
        lastSeen: Date.now(),
        groupId: 7,
        groupName: "Ops",
        groupColor: "#38bdf8",
        buildTag: "prod-build",
      } as any,
    ]);

    const nodeIds = new Set(graph.nodes.map((node) => node.data.id));
    expect(nodeIds.has("client:client-a")).toBe(true);
    expect(nodeIds.has("client:client-b")).toBe(true);
    expect(nodeIds.has("group:7")).toBe(true);
    expect(nodeIds.has("build:prod-build")).toBe(true);
    expect(nodeIds.has("os:windows")).toBe(true);
    expect(nodeIds.has("subnet:10.20.30.0/24")).toBe(true);
    expect(nodeIds.has("user:alice")).toBe(true);
    expect(graph.summary.clients).toBe(2);
    expect(graph.summary.online).toBe(1);
    expect(graph.edges.some((edge) => edge.data.source === "client:client-a" && edge.data.target === "group:7")).toBe(true);
  });

  test("normalizes IPv4 and IPv6 subnets", () => {
    expect(clientIpSubnet("192.168.4.33")).toBe("192.168.4.0/24");
    expect(clientIpSubnet("2001:db8:abcd:12::45")).toBe("2001:db8:abcd:12::/64");
    expect(clientIpSubnet("not-an-ip")).toBeNull();
  });
});
