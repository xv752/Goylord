import type { ListItem } from "../types";

export type GraphNodeKind =
  | "client"
  | "group"
  | "build"
  | "os"
  | "country"
  | "subnet"
  | "user"
  | "status";

export type ClientGraphNode = {
  data: {
    id: string;
    label: string;
    type: GraphNodeKind;
    weight: number;
    count?: number;
    onlineCount?: number;
    clientId?: string;
    online?: boolean;
    href?: string;
    color?: string | null;
    meta?: Record<string, unknown>;
  };
};

export type ClientGraphEdge = {
  data: {
    id: string;
    source: string;
    target: string;
    label: string;
    type: string;
  };
};

export type ClientGraph = {
  nodes: ClientGraphNode[];
  edges: ClientGraphEdge[];
  summary: {
    clients: number;
    totalClients?: number;
    online: number;
    categories: number;
    relationships: number;
    generatedAt: number;
  };
};

function compactLabel(value: unknown, fallback = "Unknown"): string {
  const text = String(value ?? "").trim();
  if (!text) return fallback;
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}

function safeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_.:/-]+/g, "-").slice(0, 96) || "unknown";
}

function ipv4Subnet(ip: string): string | null {
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
}

function ipv6Subnet(ip: string): string | null {
  if (!ip.includes(":")) return null;
  const parts = ip.split(":").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts.slice(0, 4).join(":")}::/64`;
}

export function clientIpSubnet(ip: unknown): string | null {
  const value = String(ip ?? "").trim();
  if (!value) return null;
  return ipv4Subnet(value) || ipv6Subnet(value);
}

export function buildClientGraph(clients: ListItem[]): ClientGraph {
  const nodes = new Map<string, ClientGraphNode>();
  const edges = new Map<string, ClientGraphEdge>();

  const addNode = (
    id: string,
    label: string,
    type: GraphNodeKind,
    data: Partial<ClientGraphNode["data"]> = {},
  ) => {
    const existing = nodes.get(id);
    if (existing) {
      existing.data.count = (existing.data.count || 0) + 1;
      if (data.online) existing.data.onlineCount = (existing.data.onlineCount || 0) + 1;
      existing.data.weight = Math.max(existing.data.weight, data.weight || 1);
      return existing;
    }
    const node: ClientGraphNode = {
      data: {
        id,
        label,
        type,
        weight: data.weight || 1,
        count: data.count,
        onlineCount: data.online ? 1 : data.onlineCount,
        ...data,
      },
    };
    nodes.set(id, node);
    return node;
  };

  const addEdge = (source: string, target: string, label: string, type: string) => {
    const id = `${source}->${target}:${type}`;
    if (edges.has(id)) return;
    edges.set(id, { data: { id, source, target, label, type } });
  };

  for (const client of clients) {
    const clientNodeId = `client:${client.id}`;
    const clientLabel = compactLabel(client.nickname || client.host || client.id);
    addNode(clientNodeId, clientLabel, "client", {
      weight: client.online ? 5 : 3,
      clientId: client.id,
      online: client.online,
      href: `/?q=${encodeURIComponent(client.id)}`,
      meta: {
        id: client.id,
        host: client.host || "",
        user: client.user || "",
        os: client.os || "",
        ip: client.ip || "",
        country: client.country || "",
        groupName: client.groupName || "",
        buildTag: client.buildTag || "",
        lastSeen: client.lastSeen,
      },
    });

    const statusNode = client.online
      ? { id: "status:online", label: "Online", color: "#22c55e" }
      : { id: "status:offline", label: "Offline", color: "#64748b" };
    addNode(statusNode.id, statusNode.label, "status", {
      weight: 4,
      online: client.online,
      color: statusNode.color,
    });
    addEdge(clientNodeId, statusNode.id, client.online ? "online" : "offline", "status");

    if (client.groupName || client.groupId) {
      const groupId = `group:${client.groupId || safeKey(client.groupName || "ungrouped")}`;
      addNode(groupId, compactLabel(client.groupName || "Group"), "group", {
        weight: 4,
        online: client.online,
        color: client.groupColor || null,
      });
      addEdge(clientNodeId, groupId, "group", "group");
    }

    if (client.buildTag) {
      const id = `build:${safeKey(client.buildTag)}`;
      addNode(id, compactLabel(client.buildTag), "build", { weight: 3, online: client.online });
      addEdge(clientNodeId, id, "build", "build");
    }

    if (client.os) {
      const id = `os:${safeKey(client.os)}`;
      addNode(id, compactLabel(client.os), "os", { weight: 3, online: client.online });
      addEdge(clientNodeId, id, "os", "os");
    }

    if (client.country) {
      const label = String(client.country).toUpperCase();
      const id = `country:${safeKey(label)}`;
      addNode(id, label, "country", { weight: 3, online: client.online });
      addEdge(clientNodeId, id, "country", "country");
    }

    const subnet = clientIpSubnet(client.ip);
    if (subnet) {
      const id = `subnet:${safeKey(subnet)}`;
      addNode(id, subnet, "subnet", { weight: 3, online: client.online });
      addEdge(clientNodeId, id, "subnet", "subnet");
    }

    if (client.user) {
      const id = `user:${safeKey(client.user)}`;
      addNode(id, compactLabel(client.user), "user", { weight: 2, online: client.online });
      addEdge(clientNodeId, id, "user", "user");
    }
  }

  const sortedNodes = Array.from(nodes.values()).map((node) => {
    if (node.data.type !== "client") {
      node.data.weight = Math.max(node.data.weight, Math.min(12, 2 + (node.data.count || 1)));
    }
    return node;
  });

  return {
    nodes: sortedNodes,
    edges: Array.from(edges.values()),
    summary: {
      clients: clients.length,
      online: clients.filter((client) => client.online).length,
      categories: sortedNodes.filter((node) => node.data.type !== "client").length,
      relationships: edges.size,
      generatedAt: Date.now(),
    },
  };
}
