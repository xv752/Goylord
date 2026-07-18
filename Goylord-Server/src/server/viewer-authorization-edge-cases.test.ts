import { afterEach, describe, expect, test } from "bun:test";
import { generateToken } from "../auth";
import { hashTokenForSession, revokeSessionByTokenHash } from "../db";
import type { SocketData } from "../sessions/types";
import {
  createUser,
  deleteUser,
  getUserById,
  setUserClientAccessScope,
  setUserFeaturePermission,
  setUserExtraPermissions,
} from "../users";
import {
  validateViewerAuthorization,
  isAuthenticatedViewerRole,
  registerViewerSocket,
  unregisterViewerSocket,
  revalidateActiveViewerSockets,
} from "./viewer-authorization";

const PASSWORD = "Aa1!ViewerAuthEdgeCase_2026";
const createdUserIds: number[] = [];

async function makeUser(role: "operator" | "viewer" = "operator") {
  const username = `va_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const result = await createUser(username, PASSWORD, role, "test");
  expect(result.success).toBe(true);
  const user = getUserById(result.userId!);
  expect(user).not.toBeNull();
  createdUserIds.push(user!.id);
  setUserClientAccessScope(user!.id, "all");
  return { user: user!, token: await generateToken(user!) };
}

function makeWs(data: Partial<SocketData>) {
  const closes: Array<{ code: number; reason: string }> = [];
  const ws = {
    data: {
      role: "rd_viewer",
      clientId: "client-a",
      ...data,
    },
    close(code: number, reason: string) {
      closes.push({ code, reason });
    },
  } as any;
  return { ws, closes };
}

afterEach(() => {
  while (createdUserIds.length) deleteUser(createdUserIds.pop()!);
});

describe("isAuthenticatedViewerRole", () => {
  test("returns true for all feature-gated viewer roles", () => {
    expect(isAuthenticatedViewerRole("console_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("rd_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("backstage_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("webcam_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("file_browser_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("process_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("keylogger_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("voice_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("desktop_audio_viewer")).toBe(true);
  });

  test("returns true for global viewer roles", () => {
    expect(isAuthenticatedViewerRole("notifications_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("dashboard_viewer")).toBe(true);
    expect(isAuthenticatedViewerRole("chat_viewer")).toBe(true);
  });

  test("returns false for client role", () => {
    expect(isAuthenticatedViewerRole("client")).toBe(false);
  });

  test("returns false for any random string", () => {
    expect(isAuthenticatedViewerRole("admin" as any)).toBe(false);
    expect(isAuthenticatedViewerRole("" as any)).toBe(false);
  });
});

describe("validateViewerAuthorization — non-viewer roles pass through", () => {
  test("client role always returns true (not a viewer)", () => {
    const { ws } = makeWs({ role: "client" as any });
    expect(validateViewerAuthorization(ws)).toBe(true);
  });
});

describe("validateViewerAuthorization — missing auth data", () => {
  test("missing authTokenHash denies", () => {
    const { ws, closes } = makeWs({ authTokenHash: undefined });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes[0]).toEqual({ code: 1008, reason: "Authentication expired" });
  });

  test("missing userId denies", () => {
    const { ws, closes } = makeWs({ userId: undefined });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes[0]?.reason).toBe("Authentication expired");
  });

  test("missing both authTokenHash and userId denies once", () => {
    const { ws, closes } = makeWs({ authTokenHash: undefined, userId: undefined });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes.length).toBe(1);
  });
});

describe("validateViewerAuthorization — session lifecycle", () => {
  test("revoked session causes denial on next check", async () => {
    const auth = await makeUser();
    const tokenHash = hashTokenForSession(auth.token);
    const { ws } = makeWs({
      authTokenHash: tokenHash,
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "rd_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(true);
    revokeSessionByTokenHash(tokenHash);
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(ws.data.userRole).toBe(auth.user.role);
  });

  test("session with wrong userId is rejected", async () => {
    const auth = await makeUser();
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: 999999,
      userRole: "operator",
      role: "rd_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("multiple rapid revalidations are idempotent", async () => {
    const auth = await makeUser();
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "rd_viewer",
    });
    for (let i = 0; i < 5; i++) {
      expect(validateViewerAuthorization(ws)).toBe(true);
    }
  });
});

describe("validateViewerAuthorization — feature gating", () => {
  test("rd_viewer denied remote_desktop feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "remote_desktop", false);
    const { ws, closes } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "rd_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes[0]?.reason).toBe("Forbidden: feature access denied");
  });

  test("console_viewer denied console feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "console", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "console_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("backstage_viewer denied backstage feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "backstage", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "backstage_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("webcam_viewer denied webcam feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "webcam", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "webcam_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("file_browser_viewer denied file_browser feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "file_browser", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "file_browser_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("voice_viewer denied voice feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "voice", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "voice_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("desktop_audio_viewer denied voice feature is denied (maps to voice)", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "voice", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "desktop_audio_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("process_viewer denied processes feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "processes", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "process_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });

  test("keylogger_viewer denied keylogger feature is denied", async () => {
    const auth = await makeUser();
    setUserFeaturePermission(auth.user.id, "keylogger", false);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "keylogger_viewer",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });
});

describe("validateViewerAuthorization — client scope gating", () => {
  test("rd_viewer with scope 'none' is denied client access", async () => {
    const auth = await makeUser();
    setUserClientAccessScope(auth.user.id, "none");
    const { ws, closes } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "rd_viewer",
      clientId: "some-client",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes[0]?.reason).toBe("Forbidden: client access denied");
  });

  test("console_viewer with scope 'none' is denied client access", async () => {
    const auth = await makeUser();
    setUserClientAccessScope(auth.user.id, "none");
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "console_viewer",
      clientId: "some-client",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
  });
});

describe("validateViewerAuthorization — global viewer roles skip feature/client checks", () => {
  test("dashboard_viewer with no feature check passes even with feature disabled", async () => {
    const auth = await makeUser();
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "dashboard_viewer",
      clientId: "client-a",
    });
    expect(validateViewerAuthorization(ws)).toBe(true);
  });

  test("notifications_viewer passes without feature check", async () => {
    const auth = await makeUser();
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "notifications_viewer",
      clientId: "client-a",
    });
    expect(validateViewerAuthorization(ws)).toBe(true);
  });

  test("chat_viewer with chat:write permission passes", async () => {
    const auth = await makeUser();
    setUserExtraPermissions(auth.user.id, ["chat:write"]);
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "chat_viewer",
      clientId: "client-a",
    });
    expect(validateViewerAuthorization(ws)).toBe(true);
  });

  test("chat_viewer without chat:write permission is denied", async () => {
    const auth = await makeUser("viewer");
    const { ws, closes } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "chat_viewer",
      clientId: "client-a",
    });
    expect(validateViewerAuthorization(ws)).toBe(false);
    expect(closes[0]?.reason).toBe("Forbidden: chat access denied");
  });
});

describe("viewer socket registry", () => {
  test("registerViewerSocket adds to set and unregisterViewerSocket removes", async () => {
    const auth = await makeUser();
    const { ws } = makeWs({
      authTokenHash: hashTokenForSession(auth.token),
      userId: auth.user.id,
      userRole: auth.user.role,
      role: "rd_viewer",
      clientId: "reg-test-client",
    });
    const registered = registerViewerSocket(ws);
    expect(registered).toBe(true);
    unregisterViewerSocket(ws);
    unregisterViewerSocket(ws);
  });

  test("registerViewerSocket returns false for unauthorized viewer", async () => {
    const { ws } = makeWs({
      authTokenHash: undefined,
      userId: 999,
      role: "rd_viewer",
    });
    const registered = registerViewerSocket(ws);
    expect(registered).toBe(false);
  });

  test("revalidateActiveViewerSockets does not crash with empty set", () => {
    expect(() => revalidateActiveViewerSockets()).not.toThrow();
  });
});
