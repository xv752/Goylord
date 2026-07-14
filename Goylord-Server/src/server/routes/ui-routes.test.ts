import { afterEach, describe, expect, test } from "bun:test";
import { generateToken } from "../../auth";
import {
  createSession,
  getSessionById,
  hashTokenForSession,
  listUserSessions,
  revokeSessionById,
} from "../../db";
import { createUser, deleteUser, getUserById } from "../../users";
import { handleUiRoutes } from "./ui-routes";

const PASSWORD = "Aa1!TurboFrameSessionsTest";
const createdUserIds: number[] = [];
const mockServer = { requestIP: () => ({ address: "127.0.0.1" }) };

async function tempUser(userAgent = "Turbo Frame Test") {
  const username = `ui_sessions_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  const created = await createUser(username, PASSWORD, "admin", "test");
  expect(created.success).toBe(true);
  const user = getUserById(created.userId!);
  expect(user).not.toBeNull();
  createdUserIds.push(user!.id);
  const token = await generateToken(user!, { ip: "127.0.0.1", userAgent });
  return { user: user!, token };
}

function call(method: string, path: string, token: string | null) {
  const url = new URL(`https://localhost${path}`);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return handleUiRoutes(new Request(url, { method, headers }), url, mockServer);
}

function addSession(userId: number, userAgent: string) {
  const now = Math.floor(Date.now() / 1000);
  const session = {
    id: crypto.randomUUID(),
    userId,
    tokenHash: crypto.randomUUID().replaceAll("-", ""),
    ip: "127.0.0.2",
    userAgent,
    createdAt: now,
    expiresAt: now + 3600,
  };
  createSession(session);
  return session;
}

afterEach(() => {
  while (createdUserIds.length > 0) {
    const id = createdUserIds.pop();
    if (typeof id === "number") deleteUser(id);
  }
});

describe("settings sessions Turbo Frame", () => {
  test("redirects unauthenticated frame requests to login", async () => {
    const response = await call("GET", "/ui/settings/sessions", null);
    expect(response!.status).toBe(303);
    expect(response!.headers.get("location")).toBe("https://localhost/login.html");
  });

  test("renders an escaped frame and marks the current session", async () => {
    const account = await tempUser('<script>alert("xss")</script>');
    const response = await call("GET", "/ui/settings/sessions", account.token);
    expect(response!.status).toBe(200);
    expect(response!.headers.get("content-type")).toContain("text/html");
    expect(response!.headers.get("cache-control")).toBe("no-store");

    const body = await response!.text();
    expect(body).toContain('<turbo-frame id="section-sessions"');
    expect(body).toContain("Current");
    expect(body).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(body).not.toContain('<script>alert("xss")</script>');
    expect(body).toContain('data-controller="sessions"');
    expect(body).toContain('data-turbo="true"');
  });

  test("revokes another session and returns the refreshed frame", async () => {
    const account = await tempUser();
    const added = addSession(account.user.id, "Second browser");
    const secondSession = getSessionById(added.id);
    expect(secondSession).toBeDefined();

    const response = await call(
      "POST",
      `/ui/settings/sessions/${encodeURIComponent(secondSession!.id)}/revoke`,
      account.token,
    );
    expect(response!.status).toBe(200);
    expect(await response!.text()).toContain("Session revoked successfully.");
    expect(getSessionById(secondSession!.id)?.revoked).toBe(true);
  });

  test("revoking the current session clears the cookie and redirects", async () => {
    const account = await tempUser();
    const currentHash = hashTokenForSession(account.token);
    const currentSession = listUserSessions(account.user.id).find((session) => session.tokenHash === currentHash);
    expect(currentSession).toBeDefined();

    const response = await call(
      "POST",
      `/ui/settings/sessions/${encodeURIComponent(currentSession!.id)}/revoke`,
      account.token,
    );
    expect(response!.status).toBe(303);
    expect(response!.headers.get("location")).toBe("/");
    expect(response!.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(getSessionById(currentSession!.id)?.revoked).toBe(true);
  });

  test("removes inactive sessions and reports the count", async () => {
    const account = await tempUser();
    const added = addSession(account.user.id, "Inactive browser");
    const secondSession = getSessionById(added.id);
    expect(secondSession).toBeDefined();
    revokeSessionById(secondSession!.id);

    const response = await call("POST", "/ui/settings/sessions/inactive", account.token);
    expect(response!.status).toBe(200);
    expect(await response!.text()).toContain("Removed 1 inactive session(s).");
    expect(getSessionById(secondSession!.id)).toBeNull();
  });
});
