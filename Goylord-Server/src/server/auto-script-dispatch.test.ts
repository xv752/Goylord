import { afterEach, describe, expect, test } from "bun:test";
import {
  createAutoScript,
  deleteAutoScript,
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
import { dispatchAutoScriptsForConnection } from "./auto-script-dispatch";

const PASSWORD = "Aa1!AutoScriptDispatchTestPass";

const createdUserIds: number[] = [];
const createdScriptIds: string[] = [];
const createdClientIds: string[] = [];

async function makeUser(role: "admin" | "operator" | "viewer") {
  const username = `as_${role.slice(0, 3)}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
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

function makeAutoScript(ownerId: number, name: string, script = "echo test") {
  const id = `auto-script-test-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  createdScriptIds.push(id);
  return createAutoScript({
    id,
    name,
    trigger: "on_connect",
    script,
    scriptType: "powershell",
    enabled: true,
    osFilter: [],
    createdByUserId: ownerId,
  });
}

function sentScripts(sent: Uint8Array[]): string[] {
  return sent
    .map((message) => decodeMessage(message) as any)
    .filter((message) => message?.commandType === "script_exec")
    .map((message) => String(message?.payload?.script || ""));
}

afterEach(() => {
  while (createdScriptIds.length > 0) {
    const id = createdScriptIds.pop();
    if (typeof id === "string") deleteAutoScript(id);
  }
  while (createdClientIds.length > 0) {
    const id = createdClientIds.pop();
    if (typeof id === "string") deleteClientRow(id);
  }
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop();
    if (typeof id === "number") deleteUser(id);
  }
});

describe("auto script dispatch RBAC", () => {
  test("admin-owned auto scripts run for every client", async () => {
    const admin = await makeUser("admin");
    makeAutoScript(admin.id, "admin global", "echo admin");

    const { info, viewerWs, sent } = makeClient(`as-admin-client-${Date.now().toString(36)}`);
    dispatchAutoScriptsForConnection(info, viewerWs);

    expect(sentScripts(sent)).toContain("echo admin");
  });

  test("operator-owned auto scripts only run for clients allowed by RBAC", async () => {
    const operator = await makeUser("operator");
    setUserClientAccessScope(operator.id, "allowlist");
    setUserClientAccessRule(operator.id, "as-allowed-client", "allow");
    makeAutoScript(operator.id, "operator scoped", "echo operator");

    const allowed = makeClient("as-allowed-client");
    dispatchAutoScriptsForConnection(allowed.info, allowed.viewerWs);
    expect(sentScripts(allowed.sent)).toContain("echo operator");

    const blocked = makeClient("as-blocked-client");
    dispatchAutoScriptsForConnection(blocked.info, blocked.viewerWs);
    expect(sentScripts(blocked.sent)).not.toContain("echo operator");
  });
});
