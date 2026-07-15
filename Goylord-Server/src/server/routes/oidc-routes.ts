import { generateToken, getSessionTtlSeconds } from "../../auth";
import { AuditAction, logAudit } from "../../auditLog";
import { logger } from "../../logger";
import { isMfaRequiredForUser, type User } from "../../users";
import {
  completeOidcLogin,
  createOidcLoginRedirect,
  getOidcPublicStatus,
  makeOidcStateCookieClear,
} from "../oidc";
import { makeAuthCookie } from "./auth-cookie";

type RequestIpProvider = {
  requestIP: (req: Request) => { address?: string } | null | undefined;
};

export async function handleOidcRoutes(
  req: Request,
  url: URL,
  server: RequestIpProvider,
): Promise<Response | null> {
  if (req.method === "GET" && url.pathname === "/api/oidc/status") {
    return Response.json(getOidcPublicStatus());
  }

  if (req.method === "GET" && url.pathname === "/api/oidc/login") {
    try {
      return await createOidcLoginRedirect(req, url);
    } catch (error) {
      logger.error("[oidc] login redirect failed", error);
      return redirectToLoginError(url, "OIDC login is not available");
    }
  }

  if (req.method === "GET" && url.pathname === "/api/oidc/callback") {
    const ip = server.requestIP(req)?.address || "unknown";
    try {
      const { user, returnTo: rawReturnTo } = await completeOidcLogin(req, url);
      const mfaBlockReason = getOidcLocalMfaBlockReason(user);
      if (mfaBlockReason) throw new Error(mfaBlockReason);

      let returnTo = rawReturnTo;
      if (!returnTo.startsWith("/") || returnTo.includes("://") || returnTo.startsWith("//")) {
        returnTo = "/";
      }

      const userAgent = req.headers.get("User-Agent") || null;
      const token = await generateToken(user, { ip, userAgent: userAgent || undefined });
      const headers = new Headers({
        "Location": new URL(returnTo, url.origin).toString(),
      });
      headers.append("Set-Cookie", makeAuthCookie(token, getSessionTtlSeconds(), req));
      headers.append("Set-Cookie", makeOidcStateCookieClear(req));

      logAudit({
        timestamp: Date.now(),
        username: user.username,
        ip,
        action: AuditAction.LOGIN,
        success: true,
        details: "OIDC login",
      });

      return new Response(null, {
        status: 302,
        headers,
      });
    } catch (error) {
      logger.warn("[oidc] callback failed", error);
      logAudit({
        timestamp: Date.now(),
        username: "unknown",
        ip,
        action: AuditAction.LOGIN_FAILED,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return redirectToLoginError(url, error instanceof Error ? error.message : "OIDC login failed", req);
    }
  }

  return null;
}

export function getOidcLocalMfaBlockReason(
  user: Pick<User, "role" | "mfa_enabled" | "mfa_secret">,
): string | null {
  if (user.mfa_enabled && user.mfa_secret) {
    return "Local MFA is enabled for this account. Use password login to complete MFA.";
  }
  if (isMfaRequiredForUser(user)) {
    return "Local MFA is required for this account and cannot be completed through OIDC.";
  }
  return null;
}

function redirectToLoginError(url: URL, message: string, req?: Request): Response {
  const loginUrl = new URL("/login.html", url.origin);
  loginUrl.searchParams.set("oidc_error", message);
  const headers = new Headers({ Location: loginUrl.toString() });
  if (req) headers.append("Set-Cookie", makeOidcStateCookieClear(req));
  return new Response(null, { status: 302, headers });
}
