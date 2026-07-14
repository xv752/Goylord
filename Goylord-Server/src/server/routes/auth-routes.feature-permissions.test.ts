import { describe, expect, test } from "bun:test";
import { generateToken } from "../../auth";
import {
  ALL_FEATURES,
  createUser,
  deleteUser,
  getUserById,
  setUserClientAccessScope,
  setUserFeaturePermission,
} from "../../users";
import { handleAuthRoutes } from "./auth-routes";

const PASSWORD = "Aa1!AuthRoutesFeaturePermsTest_2026";

const mockServer = {
  requestIP: () => ({ address: "127.0.0.1" }),
};

async function createTokenFor(role: "admin" | "operator" | "viewer") {
  const username = `me_${role.slice(0, 3)}_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  const created = await createUser(username, PASSWORD, role, "test");
  expect(created.success).toBe(true);
  expect(typeof created.userId).toBe("number");
  const user = getUserById(created.userId!);
  expect(user).not.toBeNull();
  const token = await generateToken(user!);
  return { userId: created.userId!, token, username, role };
}

describe("/api/auth/me featurePermissions", () => {
  test("admin gets every feature allowed in /api/auth/me", async () => {
    const auth = await createTokenFor("admin");
    try {
      const url = new URL("https://localhost/api/auth/me");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      expect(res).not.toBeNull();
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as any;
      expect(body.username).toBe(auth.username);
      expect(body.role).toBe("admin");
      expect(body.featurePermissions).toBeDefined();
      for (const f of ALL_FEATURES) {
        expect(body.featurePermissions[f]).toBe(true);
      }
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("operator gets every feature allowed by default in /api/auth/me", async () => {
    const auth = await createTokenFor("operator");
    try {
      const url = new URL("https://localhost/api/auth/me");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.role).toBe("operator");
      for (const f of ALL_FEATURES) {
        expect(body.featurePermissions[f]).toBe(true);
      }
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("operator-denied features are reflected in /api/auth/me", async () => {
    const auth = await createTokenFor("operator");
    try {
      setUserFeaturePermission(auth.userId, "webcam", false);
      setUserFeaturePermission(auth.userId, "file_browser", false);

      const url = new URL("https://localhost/api/auth/me");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.featurePermissions.webcam).toBe(false);
      expect(body.featurePermissions.file_browser).toBe(false);
      expect(body.featurePermissions.console).toBe(true);
      expect(body.featurePermissions.backstage).toBe(true);
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("viewer gets every feature denied in /api/auth/me", async () => {
    const auth = await createTokenFor("viewer");
    try {
      const url = new URL("https://localhost/api/auth/me");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.role).toBe("viewer");
      for (const f of ALL_FEATURES) {
        expect(body.featurePermissions[f]).toBe(false);
      }
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("/api/auth/me requires authentication", async () => {
    const url = new URL("https://localhost/api/auth/me");
    const res = await handleAuthRoutes(
      new Request(url, { method: "GET" }),
      url,
      mockServer,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });
});

describe("/api/auth/feature-check", () => {
  test("operator with allowed feature and accessible client returns allowed=true", async () => {
    const auth = await createTokenFor("operator");
    try {
      setUserClientAccessScope(auth.userId, "all");

      const url = new URL("https://localhost/api/auth/feature-check?feature=console&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(true);
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("operator with revoked feature returns allowed=false with reason 'feature'", async () => {
    const auth = await createTokenFor("operator");
    try {
      setUserClientAccessScope(auth.userId, "all");
      setUserFeaturePermission(auth.userId, "webcam", false);

      const url = new URL("https://localhost/api/auth/feature-check?feature=webcam&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(false);
      expect(body.denied).toContain("feature");
      expect(body.denied).not.toContain("client");
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("operator without client access returns allowed=false with reason 'client'", async () => {
    const auth = await createTokenFor("operator");
    try {
      // default client_scope=none

      const url = new URL("https://localhost/api/auth/feature-check?feature=console&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      expect(res!.status).toBe(200);
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(false);
      expect(body.denied).toContain("client");
      expect(body.denied).not.toContain("feature");
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("both feature and client denied returns both reasons", async () => {
    const auth = await createTokenFor("operator");
    try {
      setUserFeaturePermission(auth.userId, "backstage", false);
      // client_scope stays "none" => no access

      const url = new URL("https://localhost/api/auth/feature-check?feature=backstage&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(false);
      expect(body.denied).toContain("feature");
      expect(body.denied).toContain("client");
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("viewer is denied every feature", async () => {
    const auth = await createTokenFor("viewer");
    try {
      const url = new URL("https://localhost/api/auth/feature-check?feature=console&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(false);
      expect(body.denied).toContain("feature");
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("admin is allowed every feature, even with no client_scope", async () => {
    const auth = await createTokenFor("admin");
    try {
      const url = new URL("https://localhost/api/auth/feature-check?feature=webcam&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(true);
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("invalid feature name returns 400", async () => {
    const auth = await createTokenFor("operator");
    try {
      const url = new URL("https://localhost/api/auth/feature-check?feature=not_a_feature&clientId=client-x");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      expect(res!.status).toBe(400);
    } finally {
      deleteUser(auth.userId);
    }
  });

  test("unauthenticated request returns 401", async () => {
    const url = new URL("https://localhost/api/auth/feature-check?feature=console&clientId=client-x");
    const res = await handleAuthRoutes(
      new Request(url, { method: "GET" }),
      url,
      mockServer,
    );
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  test("clientId is optional — feature-only check works without clientId", async () => {
    const auth = await createTokenFor("operator");
    try {
      setUserFeaturePermission(auth.userId, "webcam", false);

      const url = new URL("https://localhost/api/auth/feature-check?feature=webcam");
      const res = await handleAuthRoutes(
        new Request(url, {
          method: "GET",
          headers: { Authorization: `Bearer ${auth.token}` },
        }),
        url,
        mockServer,
      );
      const body = (await res!.json()) as any;
      expect(body.allowed).toBe(false);
      expect(body.denied).toEqual(["feature"]);
    } finally {
      deleteUser(auth.userId);
    }
  });
});
