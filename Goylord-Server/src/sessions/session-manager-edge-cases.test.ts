import { describe, expect, test, afterEach } from "bun:test";
import {
  addConsoleSession,
  deleteConsoleSession,
  getConsoleSession,
  getConsoleSessionsByClient,
  getAllConsoleSessions,
  addRdSession,
  deleteRdSession,
  getRdSession,
  getRdSessionsByClient,
  getAllRdSessions,
  hasRdSessionsForClient,
  addbackstageSession,
  deletebackstageSession,
  getbackstageSession,
  getbackstageSessionsByClient,
  hasbackstageSessionsForClient,
  addFileBrowserSession,
  deleteFileBrowserSession,
  getFileBrowserSessionsByClient,
  addProcessSession,
  deleteProcessSession,
  getProcessSessionsByClient,
  addKeyloggerSession,
  deleteKeyloggerSession,
  getKeyloggerSessionsByClient,
  addVoiceSession,
  deleteVoiceSession,
  getVoiceSessionsByClient,
  addNotificationSession,
  deleteNotificationSession,
  getNotificationSessionCount,
  addDashboardSession,
  deleteDashboardSession,
  getDashboardSessionCount,
  getAllDashboardSessions,
  notifyDashboardViewers,
  notifyDashboardClientEvent,
} from "../sessions/sessionManager";

type MockWs = {
  data: any;
  sent: any[];
  closedCode?: number;
  closedReason?: string;
  send: (msg: unknown) => void;
  close: (code: number, reason: string) => void;
};

function mockWs(role?: string, clientId?: string): MockWs {
  return {
    data: { role: role || "console_viewer", clientId: clientId || "c1", userId: 1, userRole: "admin" },
    sent: [],
    send(msg: unknown) { this.sent.push(msg); },
    close(code: number, reason: string) { this.closedCode = code; this.closedReason = reason; },
  };
}

describe("dashboard sessions — edge cases", () => {
  test("add multiple dashboard sessions and count correctly", () => {
    const ws1 = mockWs("dashboard_viewer");
    const ws2 = mockWs("dashboard_viewer");
    const ws3 = mockWs("dashboard_viewer");
    addDashboardSession({ id: "ds-multi-1", viewer: ws1 as any, createdAt: Date.now() });
    addDashboardSession({ id: "ds-multi-2", viewer: ws2 as any, createdAt: Date.now() });
    addDashboardSession({ id: "ds-multi-3", viewer: ws3 as any, createdAt: Date.now() });
    expect(getDashboardSessionCount()).toBeGreaterThanOrEqual(3);
    deleteDashboardSession("ds-multi-1");
    deleteDashboardSession("ds-multi-2");
    deleteDashboardSession("ds-multi-3");
  });

  test("deleteDashboardSession returns false for nonexistent session", () => {
    expect(deleteDashboardSession("ds-nonexistent-xyz")).toBe(false);
  });

  test("getAllDashboardSessions returns the Map instance", () => {
    const ws = mockWs();
    addDashboardSession({ id: "ds-map-test", viewer: ws as any, createdAt: Date.now() });
    const all = getAllDashboardSessions();
    expect(all).toBeInstanceOf(Map);
    expect(all.has("ds-map-test")).toBe(true);
    deleteDashboardSession("ds-map-test");
  });

  test("dashboard session with userId and userRole metadata", () => {
    const ws = mockWs();
    addDashboardSession({
      id: "ds-meta",
      viewer: ws as any,
      createdAt: Date.now(),
      userId: 42,
      userRole: "operator",
    });
    const all = getAllDashboardSessions();
    const session = all.get("ds-meta");
    expect(session).toBeDefined();
    expect(session!.userId).toBe(42);
    expect(session!.userRole).toBe("operator");
    deleteDashboardSession("ds-meta");
  });

  test("notifyDashboardViewers does not throw with active sessions", async () => {
    const ws = mockWs();
    addDashboardSession({ id: "ds-notify", viewer: ws as any, createdAt: Date.now() });
    expect(() => notifyDashboardViewers()).not.toThrow();
    await new Promise((r) => setTimeout(r, 1200));
    deleteDashboardSession("ds-notify");
  });

  test("notifyDashboardClientEvent does not throw with active sessions", () => {
    const ws = mockWs();
    addDashboardSession({ id: "ds-cevt", viewer: ws as any, createdAt: Date.now() });
    expect(() => notifyDashboardClientEvent("client_online", { id: "some-client" })).not.toThrow();
    deleteDashboardSession("ds-cevt");
  });
});

describe("console sessions — edge cases", () => {
  test("multiple sessions for same client", () => {
    const ws = mockWs("console_viewer", "multi-console");
    addConsoleSession({ id: "cs-e1", clientId: "multi-console", viewer: ws as any, createdAt: Date.now() });
    addConsoleSession({ id: "cs-e2", clientId: "multi-console", viewer: ws as any, createdAt: Date.now() });
    expect(getConsoleSessionsByClient("multi-console").length).toBe(2);
    deleteConsoleSession("cs-e1");
    deleteConsoleSession("cs-e2");
  });

  test("getAllConsoleSessions returns the Map instance", () => {
    const ws = mockWs();
    addConsoleSession({ id: "cs-all", clientId: "c-all", viewer: ws as any, createdAt: Date.now() });
    expect(getAllConsoleSessions()).toBeInstanceOf(Map);
    expect(getAllConsoleSessions().has("cs-all")).toBe(true);
    deleteConsoleSession("cs-all");
  });

  test("sessionId overwrites if same id used twice", () => {
    const ws1 = mockWs("console_viewer", "ow-c1");
    const ws2 = mockWs("console_viewer", "ow-c2");
    addConsoleSession({ id: "cs-ow", clientId: "ow-c1", viewer: ws1 as any, createdAt: 100 });
    addConsoleSession({ id: "cs-ow", clientId: "ow-c2", viewer: ws2 as any, createdAt: 200 });
    const session = getConsoleSession("cs-ow");
    expect(session!.clientId).toBe("ow-c2");
    deleteConsoleSession("cs-ow");
  });
});

describe("RD sessions — edge cases", () => {
  test("multiple RD sessions for different clients", () => {
    const ws1 = mockWs("rd_viewer", "rd-multi-a");
    const ws2 = mockWs("rd_viewer", "rd-multi-b");
    addRdSession({ id: "rd-e1", clientId: "rd-multi-a", viewer: ws1 as any, createdAt: Date.now() });
    addRdSession({ id: "rd-e2", clientId: "rd-multi-b", viewer: ws2 as any, createdAt: Date.now() });
    expect(hasRdSessionsForClient("rd-multi-a")).toBe(true);
    expect(hasRdSessionsForClient("rd-multi-b")).toBe(true);
    expect(getRdSessionsByClient("rd-multi-a").length).toBe(1);
    expect(getRdSessionsByClient("rd-multi-b").length).toBe(1);
    deleteRdSession("rd-e1");
    deleteRdSession("rd-e2");
  });

  test("getAllRdSessions returns the Map instance", () => {
    const ws = mockWs();
    addRdSession({ id: "rd-all", clientId: "c-rd-all", viewer: ws as any, createdAt: Date.now() });
    expect(getAllRdSessions()).toBeInstanceOf(Map);
    deleteRdSession("rd-all");
  });
});

describe("backstage sessions — edge cases", () => {
  test("multiple backstage sessions for same client", () => {
    const ws = mockWs("backstage_viewer", "bs-multi");
    addbackstageSession({ id: "bs-e1", clientId: "bs-multi", viewer: ws as any, createdAt: Date.now() });
    addbackstageSession({ id: "bs-e2", clientId: "bs-multi", viewer: ws as any, createdAt: Date.now() });
    expect(getbackstageSessionsByClient("bs-multi").length).toBe(2);
    expect(hasbackstageSessionsForClient("bs-multi")).toBe(true);
    deletebackstageSession("bs-e1");
    deletebackstageSession("bs-e2");
    expect(hasbackstageSessionsForClient("bs-multi")).toBe(false);
  });
});

describe("file browser sessions — edge cases", () => {
  test("multiple file browser sessions for same client", () => {
    const ws = mockWs("file_browser_viewer", "fb-multi");
    addFileBrowserSession({ id: "fb-e1", clientId: "fb-multi", viewer: ws as any, createdAt: Date.now() });
    addFileBrowserSession({ id: "fb-e2", clientId: "fb-multi", viewer: ws as any, createdAt: Date.now() });
    expect(getFileBrowserSessionsByClient("fb-multi").length).toBe(2);
    deleteFileBrowserSession("fb-e1");
    deleteFileBrowserSession("fb-e2");
  });
});

describe("process sessions — edge cases", () => {
  test("multiple process sessions for same client", () => {
    const ws = mockWs("process_viewer", "ps-multi");
    addProcessSession({ id: "ps-e1", clientId: "ps-multi", viewer: ws as any, createdAt: Date.now() });
    addProcessSession({ id: "ps-e2", clientId: "ps-multi", viewer: ws as any, createdAt: Date.now() });
    expect(getProcessSessionsByClient("ps-multi").length).toBe(2);
    deleteProcessSession("ps-e1");
    deleteProcessSession("ps-e2");
  });
});

describe("keylogger sessions — edge cases", () => {
  test("multiple keylogger sessions for same client", () => {
    const ws = mockWs("keylogger_viewer", "kl-multi");
    addKeyloggerSession({ id: "kl-e1", clientId: "kl-multi", viewer: ws as any, createdAt: Date.now() });
    addKeyloggerSession({ id: "kl-e2", clientId: "kl-multi", viewer: ws as any, createdAt: Date.now() });
    expect(getKeyloggerSessionsByClient("kl-multi").length).toBe(2);
    deleteKeyloggerSession("kl-e1");
    deleteKeyloggerSession("kl-e2");
  });
});

describe("voice sessions — edge cases", () => {
  test("multiple voice sessions for same client", () => {
    const ws = mockWs("voice_viewer", "vc-multi");
    addVoiceSession({ id: "vc-e1", clientId: "vc-multi", viewer: ws as any, createdAt: Date.now() });
    addVoiceSession({ id: "vc-e2", clientId: "vc-multi", viewer: ws as any, createdAt: Date.now() });
    expect(getVoiceSessionsByClient("vc-multi").length).toBe(2);
    deleteVoiceSession("vc-e1");
    deleteVoiceSession("vc-e2");
  });
});

describe("notification sessions — edge cases", () => {
  test("multiple notification sessions tracked correctly", () => {
    const ws = mockWs("notifications_viewer", "ns-multi");
    addNotificationSession({ id: "ns-e1", viewer: ws as any, createdAt: Date.now() });
    addNotificationSession({ id: "ns-e2", viewer: ws as any, createdAt: Date.now() });
    expect(getNotificationSessionCount()).toBeGreaterThanOrEqual(2);
    deleteNotificationSession("ns-e1");
    deleteNotificationSession("ns-e2");
  });
});

describe("cross-session isolation", () => {
  test("console and RD sessions for same client do not interfere", () => {
    const ws = mockWs("console_viewer", "iso-c1");
    const rdWs = mockWs("rd_viewer", "iso-c1");
    addConsoleSession({ id: "iso-cs", clientId: "iso-c1", viewer: ws as any, createdAt: Date.now() });
    addRdSession({ id: "iso-rd", clientId: "iso-c1", viewer: rdWs as any, createdAt: Date.now() });
    expect(getConsoleSessionsByClient("iso-c1").length).toBe(1);
    expect(getRdSessionsByClient("iso-c1").length).toBe(1);
    deleteConsoleSession("iso-cs");
    deleteRdSession("iso-rd");
    expect(getConsoleSessionsByClient("iso-c1").length).toBe(0);
    expect(getRdSessionsByClient("iso-c1").length).toBe(0);
  });

  test("deleting console session does not affect RD session", () => {
    const ws = mockWs("console_viewer", "del-iso-c1");
    const rdWs = mockWs("rd_viewer", "del-iso-c1");
    addConsoleSession({ id: "del-iso-cs", clientId: "del-iso-c1", viewer: ws as any, createdAt: Date.now() });
    addRdSession({ id: "del-iso-rd", clientId: "del-iso-c1", viewer: rdWs as any, createdAt: Date.now() });
    deleteConsoleSession("del-iso-cs");
    expect(hasRdSessionsForClient("del-iso-c1")).toBe(true);
    deleteRdSession("del-iso-rd");
  });
});
