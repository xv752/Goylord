import fs from "fs/promises";
import path from "path";
import { afterEach, describe, expect, test } from "bun:test";
import {
  createAutoDeploy,
  deleteAutoDeploy,
  deleteClientRow,
  upsertClientRow,
} from "../db";
import { decodeMessage } from "../protocol";
import {
  createUser,
  deleteUser,
  getUserById,
  setUserClientAccessRule,
  setUserClientAccessScope,
} from "../users";
import type { ClientInfo } from "../types";
import { dispatchAutoDeploysForConnection } from "./auto-deploy-dispatch";

const PASSWORD = "Aa1!AutoDeployDispatchTestPass";

const createdUserIds: number[] = [];
const createdDeployIds: string[] = [];
const createdClientIds: string[] = [];
const createdDirs: string[] = [];

async function makeUser(role: "admin" | "operator" | "viewer") {
  const username = `ad_${role.slice(0, 3)}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const result = await createUser(username, PASSWORD, role, "test");
  expect(result.success).toBe(true);
  const user = getUserById(result.userId!);
  expect(user).not.toBeNull();
  createdUserIds.push(user!.id);
  return user!;
}

function makeClient(id: string, os = "windows") {
  const sent: Uint8Array[] = [];
  upsertClientRow({
    id,
    os,
    arch: "x64",
    online: 1,
    lastSeen: Date.now(),
  });
  createdClientIds.push(id);

  const info: ClientInfo = {
    id,
    role: "client",
    os,
    lastSeen: Date.now(),
    ws: {
      send(message: Uint8Array) {
        sent.push(message);
      },
    },
  };

  const viewerWs = { data: { wasKnown: true } } as any;
  return { info, viewerWs, sent };
}

async function makeAutoDeploy(ownerId: number, name: string) {
  const id = `auto-deploy-test-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const dir = path.resolve(".test-data", "auto-deploy-dispatch", id);
  const filePath = path.join(dir, "payload.exe");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, "payload");
  createdDirs.push(dir);
  createdDeployIds.push(id);
  return createAutoDeploy({
    id,
    name,
    trigger: "on_connect",
    filePath,
    fileName: "payload.exe",
    fileSize: 7,
    fileOs: "windows",
    args: "",
    hideWindow: true,
    enabled: true,
    osFilter: [],
    createdByUserId: ownerId,
  });
}

function sentCommandTypes(sent: Uint8Array[]): string[] {
  return sent
    .map((message) => decodeMessage(message) as any)
    .map((message) => String(message?.commandType || ""));
}

async function resolvePendingOnce(pendingCommandReplies: Map<string, any>) {
  const first = pendingCommandReplies.entries().next().value;
  expect(first).toBeTruthy();
  if (!first) throw new Error("Expected one pending command reply");
  const [cmdId, pending] = first;
  clearTimeout(pending.timeout);
  pending.resolve({ ok: true, message: "ok" });
  pendingCommandReplies.delete(cmdId);
  await Promise.resolve();
}

afterEach(async () => {
  while (createdDeployIds.length > 0) {
    const id = createdDeployIds.pop();
    if (typeof id === "string") deleteAutoDeploy(id);
  }
  while (createdClientIds.length > 0) {
    const id = createdClientIds.pop();
    if (typeof id === "string") deleteClientRow(id);
  }
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop();
    if (typeof id === "number") deleteUser(id);
  }
  while (createdDirs.length > 0) {
    const dir = createdDirs.pop();
    if (typeof dir === "string") await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("auto deploy dispatch", () => {
  test("operator-owned auto deploys only run for clients allowed by RBAC", async () => {
    const operator = await makeUser("operator");
    setUserClientAccessScope(operator.id, "allowlist");
    setUserClientAccessRule(operator.id, "ad-allowed-client", "allow");
    await makeAutoDeploy(operator.id, "operator scoped");

    const allowedPending = new Map<string, any>();
    const allowed = makeClient("ad-allowed-client");
    dispatchAutoDeploysForConnection(allowed.info, allowed.viewerWs, {
      pendingCommandReplies: allowedPending,
    });
    expect(sentCommandTypes(allowed.sent)).toContain("file_upload_http");
    expect(sentCommandTypes(allowed.sent)).not.toContain("silent_exec");

    await resolvePendingOnce(allowedPending);
    expect(sentCommandTypes(allowed.sent)).toContain("silent_exec");
    await resolvePendingOnce(allowedPending);

    const blockedPending = new Map<string, any>();
    const blocked = makeClient("ad-blocked-client");
    dispatchAutoDeploysForConnection(blocked.info, blocked.viewerWs, {
      pendingCommandReplies: blockedPending,
    });
    expect(sentCommandTypes(blocked.sent)).not.toContain("file_upload_http");
    expect(sentCommandTypes(blocked.sent)).not.toContain("silent_exec");
    expect(blockedPending.size).toBe(0);
  });
});
