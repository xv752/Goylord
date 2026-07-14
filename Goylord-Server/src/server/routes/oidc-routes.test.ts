import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getConfig, updateOidcConfig, updateSecurityConfig, type Config } from "../../config";
import { createUser } from "../../users";
import { createOidcLoginRedirect, resolveOidcUser } from "../oidc";
import { getOidcLocalMfaBlockReason, handleOidcRoutes } from "./oidc-routes";

const server = {
  requestIP: () => ({ address: "127.0.0.1" }),
};

let originalOidc: Config["oidc"];
let originalSecurity: Config["security"];
const originalFetch = globalThis.fetch;

beforeAll(() => {
  originalOidc = { ...getConfig().oidc, scopes: [...getConfig().oidc.scopes] };
  originalSecurity = { ...getConfig().security };
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  await updateOidcConfig(originalOidc);
  await updateSecurityConfig(originalSecurity);
});

describe("OIDC routes", () => {
  test("status reports disabled when OIDC is not configured", async () => {
    const req = new Request("https://localhost/api/oidc/status");
    const url = new URL(req.url);

    const res = await handleOidcRoutes(req, url, server);

    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body.enabled).toBe(false);
    expect(body.loginUrl).toBeNull();
  });

  test("login redirect stores a browser-bound OIDC state cookie", async () => {
    const issuer = `https://oidc-state-${Date.now()}.example.test`;
    await configureOidc(issuer);
    mockDiscovery(issuer);

    const req = new Request("https://localhost/api/oidc/login?returnTo=/settings.html");
    const res = await createOidcLoginRedirect(req, new URL(req.url));

    expect(res.status).toBe(302);
    expect(res.headers.get("Set-Cookie")).toContain("goylord_oidc_state=");
    expect(res.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(res.headers.get("Set-Cookie")).toContain("SameSite=Lax");

    const redirect = new URL(res.headers.get("Location")!);
    expect(redirect.searchParams.get("state")).toBeTruthy();
    expect(redirect.searchParams.get("code_challenge_method")).toBe("S256");
  });

  test("callback rejects state values that are not bound to the browser cookie", async () => {
    const issuer = `https://oidc-csrf-${Date.now()}.example.test`;
    await configureOidc(issuer);
    mockDiscovery(issuer);

    const loginReq = new Request("https://localhost/api/oidc/login");
    const loginRes = await createOidcLoginRedirect(loginReq, new URL(loginReq.url));
    const state = new URL(loginRes.headers.get("Location")!).searchParams.get("state")!;

    const callbackReq = new Request(`https://localhost/api/oidc/callback?code=fake-code&state=${state}`);
    const callbackRes = await handleOidcRoutes(callbackReq, new URL(callbackReq.url), server);

    expect(callbackRes?.status).toBe(302);
    const location = new URL(callbackRes!.headers.get("Location")!);
    expect(location.pathname).toBe("/login.html");
    expect(location.searchParams.get("oidc_error")).toContain("state cookie mismatch");
    expect(callbackRes!.headers.get("Set-Cookie")).toContain("goylord_oidc_state=;");
  });

  test("login redirect rejects non-HTTPS issuers before discovery", async () => {
    await configureOidc("http://oidc-insecure.example.test");
    setMockFetch(async () => {
      throw new Error("fetch should not be called for insecure issuer");
    });

    const req = new Request("https://localhost/api/oidc/login");
    await expect(createOidcLoginRedirect(req, new URL(req.url))).rejects.toThrow("HTTPS");
  });

  test("email linking does not fall back to local usernames", async () => {
    const username = `oidc_link_${Date.now().toString(36)}`;
    const created = await createUser(username, "Aa1!VeryLongTestPassword_2026", "operator", "test");
    expect(created.success).toBe(true);

    const oidc: Config["oidc"] = {
      ...getConfig().oidc,
      enabled: true,
      issuer: "https://issuer.example.test",
      clientId: "client",
      allowEmailLink: true,
      autoProvision: false,
      allowedEmails: [],
      allowedDomains: [],
    };

    await expect(resolveOidcUser(oidc, "https://issuer.example.test", {
      sub: `subject-${Date.now()}`,
      email: `${username}@example.test`,
      email_verified: true,
      preferred_username: "not-local",
    } as any)).rejects.toThrow("No linked Goylord account exists");
  });

  test("OIDC session issuance is blocked when local MFA is enabled or required", async () => {
    await updateSecurityConfig({
      ...getConfig().security,
      mfaRequiredForAdmins: true,
      mfaRequiredForNonAdmins: false,
    });

    expect(getOidcLocalMfaBlockReason({
      role: "operator",
      mfa_enabled: 1,
      mfa_secret: "secret",
    })).toContain("Local MFA is enabled");

    expect(getOidcLocalMfaBlockReason({
      role: "admin",
      mfa_enabled: 0,
      mfa_secret: null,
    })).toContain("Local MFA is required");

    expect(getOidcLocalMfaBlockReason({
      role: "operator",
      mfa_enabled: 0,
      mfa_secret: null,
    })).toBeNull();
  });
});

async function configureOidc(issuer: string): Promise<void> {
  await updateOidcConfig({
    enabled: true,
    issuer,
    clientId: "goylord-test",
    clientSecret: "secret",
    redirectUri: "https://localhost/api/oidc/callback",
    scopes: ["openid", "profile", "email"],
    clientAuthMethod: "client_secret_post",
    autoProvision: false,
    allowEmailLink: false,
    defaultRole: "viewer",
    allowedEmails: [],
    allowedDomains: [],
    groupClaim: "groups",
    adminGroups: [],
    operatorGroups: [],
    viewerGroups: [],
  });
}

function mockDiscovery(issuer: string): void {
  setMockFetch(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${issuer}/.well-known/openid-configuration`) {
      return Response.json({
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
      });
    }
    throw new Error(`Unexpected OIDC fetch: ${url}`);
  });
}

function setMockFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = Object.assign(handler, {
    preconnect: originalFetch.preconnect,
  }) as typeof fetch;
}
