import { importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";
import { getConfig, type Config } from "../config";
import {
  getOidcIdentity,
  getOidcIdentityByEmail,
  pruneExpiredOidcAuthStates,
  saveOidcAuthState,
  takeOidcAuthState,
  upsertOidcIdentity,
} from "../db";
import { logger } from "../logger";
import {
  createExternalUser,
  getUserById,
  getUserByUsername,
  updateLastLogin,
  type User,
  type UserRole,
} from "../users";
import { shouldUseSecureAuthCookie } from "./routes/auth-cookie";

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

type OidcClaims = JWTPayload & {
  sub: string;
  email?: string;
  email_verified?: boolean;
  preferred_username?: string;
  name?: string;
  groups?: unknown;
  [key: string]: unknown;
};

const discoveryCache = new Map<string, { expiresAt: number; metadata: OidcDiscovery }>();
const jwksCache = new Map<string, { expiresAt: number; keys: JWK[] }>();
const DISCOVERY_TTL_MS = 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;
const OIDC_STATE_COOKIE = "goylord_oidc_state";

export function getOidcPublicStatus(): { enabled: boolean; label: string; loginUrl: string | null } {
  const oidc = getConfig().oidc;
  const configured = Boolean(oidc.enabled && oidc.issuer && oidc.clientId);
  return {
    enabled: configured,
    label: oidc.label || "Single sign-on",
    loginUrl: configured ? "/api/oidc/login" : null,
  };
}

export async function createOidcLoginRedirect(req: Request, url: URL): Promise<Response> {
  const oidc = getConfig().oidc;
  if (!isOidcConfigured(oidc)) {
    return Response.json({ error: "OIDC is not configured" }, { status: 404 });
  }

  pruneExpiredOidcAuthStates();

  const metadata = await getDiscovery(oidc);
  const state = randomBase64Url(32);
  const nonce = randomBase64Url(32);
  const codeVerifier = randomBase64Url(48);
  const codeChallenge = await pkceChallenge(codeVerifier);
  const redirectUri = getRedirectUri(oidc, url);
  const returnTo = normalizeReturnTo(url.searchParams.get("returnTo") || req.headers.get("Referer"));
  const now = Date.now();

  saveOidcAuthState({
    state,
    nonce,
    codeVerifier,
    returnTo,
    createdAt: now,
    expiresAt: now + STATE_TTL_MS,
  });

  const authUrl = new URL(metadata.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", oidc.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", normalizeScopes(oidc.scopes).join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const headers = new Headers({ Location: authUrl.toString() });
  headers.append("Set-Cookie", makeOidcStateCookie(state, req));
  return new Response(null, { status: 302, headers });
}

export async function completeOidcLogin(req: Request, url: URL): Promise<{ user: User; returnTo: string }> {
  const oidc = getConfig().oidc;
  if (!isOidcConfigured(oidc)) {
    throw new Error("OIDC is not configured");
  }

  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description");
    throw new Error(description || error);
  }

  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code || !state) {
    throw new Error("Missing OIDC callback parameters");
  }

  if (getOidcStateCookie(req) !== state) {
    throw new Error("OIDC state cookie mismatch. Please try again.");
  }

  const savedState = takeOidcAuthState(state);
  if (!savedState || savedState.expiresAt <= Date.now()) {
    throw new Error("OIDC login expired. Please try again.");
  }

  const metadata = await getDiscovery(oidc);
  const redirectUri = getRedirectUri(oidc, url);
  const tokenSet = await exchangeCodeForTokens(oidc, metadata, {
    code,
    codeVerifier: savedState.codeVerifier,
    redirectUri,
  });

  const idToken = typeof tokenSet.id_token === "string" ? tokenSet.id_token : "";
  if (!idToken) {
    throw new Error("OIDC provider did not return an ID token");
  }

  const claims = await verifyIdToken(oidc, metadata, idToken, savedState.nonce);
  const mergedClaims = await maybeFetchUserinfo(metadata, tokenSet.access_token, claims);
  const user = await resolveOidcUser(oidc, metadata.issuer, mergedClaims);

  return { user, returnTo: savedState.returnTo || "/" };
}

function isOidcConfigured(oidc: Config["oidc"]): boolean {
  return Boolean(oidc.enabled && oidc.issuer && oidc.clientId);
}

async function getDiscovery(oidc: Config["oidc"]): Promise<OidcDiscovery> {
  const issuer = normalizeIssuerUrl(oidc.issuer);
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.metadata;

  const res = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);

  const metadata = await res.json() as OidcDiscovery;
  if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.jwks_uri) {
    throw new Error("OIDC discovery document is missing required endpoints");
  }

  const discoveredIssuer = normalizeIssuerUrl(metadata.issuer || "");
  if (discoveredIssuer !== issuer) {
    throw new Error("OIDC discovery issuer does not match the configured issuer");
  }

  const normalized = {
    ...metadata,
    issuer: discoveredIssuer,
    authorization_endpoint: requireHttpsUrl(metadata.authorization_endpoint, "authorization_endpoint"),
    token_endpoint: requireHttpsUrl(metadata.token_endpoint, "token_endpoint"),
    jwks_uri: requireHttpsUrl(metadata.jwks_uri, "jwks_uri"),
    userinfo_endpoint: metadata.userinfo_endpoint
      ? requireHttpsUrl(metadata.userinfo_endpoint, "userinfo_endpoint")
      : undefined,
  };
  discoveryCache.set(issuer, {
    expiresAt: Date.now() + DISCOVERY_TTL_MS,
    metadata: normalized,
  });
  return normalized;
}

async function exchangeCodeForTokens(
  oidc: Config["oidc"],
  metadata: OidcDiscovery,
  input: { code: string; codeVerifier: string; redirectUri: string },
): Promise<Record<string, any>> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: oidc.clientId,
    code_verifier: input.codeVerifier,
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };

  if (oidc.clientAuthMethod === "client_secret_post" && oidc.clientSecret) {
    body.set("client_secret", oidc.clientSecret);
  } else if (oidc.clientAuthMethod === "client_secret_basic" && oidc.clientSecret) {
    headers.Authorization = `Basic ${Buffer.from(`${oidc.clientId}:${oidc.clientSecret}`).toString("base64")}`;
  }

  const res = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers,
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = typeof payload.error_description === "string"
      ? payload.error_description
      : typeof payload.error === "string"
        ? payload.error
        : `HTTP ${res.status}`;
    throw new Error(`OIDC token exchange failed: ${detail}`);
  }
  return payload;
}

async function verifyIdToken(
  oidc: Config["oidc"],
  metadata: OidcDiscovery,
  idToken: string,
  nonce: string,
): Promise<OidcClaims> {
  const { payload } = await jwtVerify(idToken, async (protectedHeader) => {
    const key = await getJwkForHeader(metadata, protectedHeader.kid, protectedHeader.alg);
    return importJWK(key, protectedHeader.alg);
  }, {
    issuer: metadata.issuer,
    audience: oidc.clientId,
  });
  if (payload.nonce !== nonce) {
    throw new Error("OIDC nonce mismatch");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("OIDC ID token is missing subject");
  }
  return payload as OidcClaims;
}

async function getJwkForHeader(metadata: OidcDiscovery, kid?: string, alg?: string): Promise<JWK> {
  const keys = await getJwks(metadata.jwks_uri);
  const key = keys.find((candidate) =>
    (!kid || candidate.kid === kid) &&
    (!alg || !candidate.alg || candidate.alg === alg) &&
    (!candidate.use || candidate.use === "sig"),
  );
  if (!key) {
    throw new Error("OIDC signing key was not found in JWKS");
  }
  return key;
}

async function getJwks(jwksUri: string): Promise<JWK[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;

  const res = await fetch(jwksUri, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`OIDC JWKS request failed (${res.status})`);
  const body = await res.json() as { keys?: JWK[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  if (!keys.length) throw new Error("OIDC JWKS did not contain signing keys");
  jwksCache.set(jwksUri, { expiresAt: Date.now() + 10 * 60 * 1000, keys });
  return keys;
}

async function maybeFetchUserinfo(
  metadata: OidcDiscovery,
  accessToken: unknown,
  claims: OidcClaims,
): Promise<OidcClaims> {
  if (!metadata.userinfo_endpoint || typeof accessToken !== "string" || !accessToken) {
    return claims;
  }
  try {
    const res = await fetch(metadata.userinfo_endpoint, {
      headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return claims;
    const userinfo = await res.json();
    return { ...claims, ...userinfo, sub: claims.sub };
  } catch (err) {
    logger.warn("[oidc] userinfo request failed", err);
    return claims;
  }
}

export async function resolveOidcUser(oidc: Config["oidc"], issuer: string, claims: OidcClaims): Promise<User> {
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const usernameClaim = typeof claims.preferred_username === "string"
    ? claims.preferred_username
    : typeof claims.name === "string"
      ? claims.name
      : "";

  enforceAllowedIdentity(oidc, email);

  const existingIdentity = getOidcIdentity(issuer, claims.sub);
  if (existingIdentity) {
    const existingUser = getUserById(existingIdentity.userId);
    if (existingUser) {
      updateLastLogin(existingUser.id);
      upsertOidcIdentity({
        issuer,
        subject: claims.sub,
        userId: existingUser.id,
        email,
        username: usernameClaim,
      });
      return existingUser;
    }
  }

  if (oidc.allowEmailLink && email && claims.email_verified === true) {
    const existingEmailIdentity = getOidcIdentityByEmail(issuer, email);
    if (existingEmailIdentity) {
      const user = getUserById(existingEmailIdentity.userId);
      if (user) {
        updateLastLogin(user.id);
        upsertOidcIdentity({ issuer, subject: claims.sub, userId: user.id, email, username: usernameClaim });
        return user;
      }
    }
  }

  if (!oidc.autoProvision) {
    throw new Error("No linked Goylord account exists for this OIDC identity");
  }

  const username = pickAvailableUsername(usernameClaim || email.split("@")[0] || `oidc_${claims.sub.slice(0, 12)}`);
  const role = roleFromClaims(oidc, claims);
  const created = await createExternalUser(username, role, "oidc", "oidc");
  if (!created.success || !created.userId) {
    throw new Error(created.error || "Failed to provision OIDC user");
  }

  upsertOidcIdentity({ issuer, subject: claims.sub, userId: created.userId, email, username: usernameClaim });
  updateLastLogin(created.userId);
  const user = getUserById(created.userId);
  if (!user) throw new Error("Provisioned user could not be loaded");
  return user;
}

function enforceAllowedIdentity(oidc: Config["oidc"], email: string): void {
  const allowedEmails = oidc.allowedEmails.map((v) => v.toLowerCase());
  const allowedDomains = oidc.allowedDomains.map((v) => v.toLowerCase().replace(/^@/, ""));

  if (allowedEmails.length > 0 && (!email || !allowedEmails.includes(email))) {
    throw new Error("This OIDC account is not allowed to access Goylord");
  }

  if (allowedDomains.length > 0) {
    const domain = email.includes("@") ? email.split("@").pop()!.toLowerCase() : "";
    if (!domain || !allowedDomains.includes(domain)) {
      throw new Error("This OIDC email domain is not allowed to access Goylord");
    }
  }
}

function roleFromClaims(oidc: Config["oidc"], claims: OidcClaims): UserRole {
  const groups = getClaimStrings(claims[oidc.groupClaim || "groups"]);
  const hasGroup = (configured: string[]) => configured.some((group) => groups.has(group));
  if (hasGroup(oidc.adminGroups)) return "admin";
  if (hasGroup(oidc.operatorGroups)) return "operator";
  if (hasGroup(oidc.viewerGroups)) return "viewer";
  return oidc.defaultRole;
}

function getClaimStrings(value: unknown): Set<string> {
  if (Array.isArray(value)) return new Set(value.map((v) => String(v)));
  if (typeof value === "string" && value.trim()) return new Set([value.trim()]);
  return new Set();
}

function pickAvailableUsername(seed: string): string {
  const base = sanitizeUsername(seed) || "oidc_user";
  if (!getUserByUsername(base)) return base;
  const trimmed = base.slice(0, 27);
  for (let i = 1; i < 1000; i++) {
    const candidate = `${trimmed}_${i}`;
    if (!getUserByUsername(candidate)) return candidate;
  }
  return `oidc_${randomBase64Url(8)}`.slice(0, 32);
}

function sanitizeUsername(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return cleaned.length >= 3 ? cleaned : "";
}

function normalizeScopes(scopes: string[]): string[] {
  const result = Array.from(new Set(["openid", ...scopes.map((s) => String(s).trim()).filter(Boolean)]));
  return result;
}

function getRedirectUri(oidc: Config["oidc"], url: URL): string {
  return oidc.redirectUri || new URL("/api/oidc/callback", url.origin).toString();
}

export function makeOidcStateCookie(state: string, req: Request): string {
  const securePart = shouldUseSecureAuthCookie(req) ? "Secure; " : "";
  return `${OIDC_STATE_COOKIE}=${state}; HttpOnly; ${securePart}SameSite=Lax; Path=/api/oidc/callback; Max-Age=${Math.ceil(STATE_TTL_MS / 1000)}`;
}

export function makeOidcStateCookieClear(req: Request): string {
  const securePart = shouldUseSecureAuthCookie(req) ? "Secure; " : "";
  return `${OIDC_STATE_COOKIE}=; HttpOnly; ${securePart}SameSite=Lax; Path=/api/oidc/callback; Max-Age=0`;
}

function getOidcStateCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(/;\s*/);
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split("=");
    if (name === OIDC_STATE_COOKIE) {
      return valueParts.join("=") || null;
    }
  }
  return null;
}

function normalizeIssuerUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("OIDC issuer must be a valid HTTPS URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("OIDC issuer must use HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("OIDC issuer must not include credentials");
  }
  return parsed.toString().replace(/\/+$/, "");
}

function requireHttpsUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`OIDC ${field} must be a valid HTTPS URL`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`OIDC ${field} must use HTTPS`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`OIDC ${field} must not include credentials`);
  }
  return parsed.toString();
}

function normalizeReturnTo(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, "https://placeholder.local");
    const relative = `${url.pathname}${url.search}${url.hash}`;
    if (!relative.startsWith("/") || relative.startsWith("//")) return null;
    if (relative.startsWith("/api/")) return null;
    return relative;
  } catch {
    return null;
  }
}

function randomBase64Url(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return Buffer.from(digest).toString("base64url");
}
