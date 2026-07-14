function envFlagEnabled(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function envFlagDisabled(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "0" || v === "false" || v === "no" || v === "off";
}

function shouldTrustProxyHeaders(): boolean {
  const explicit = String(process.env.GOYLORD_TRUST_PROXY_HEADERS || "");
  if (explicit) return envFlagEnabled(explicit);
  return false;
}

export function shouldUseSecureAuthCookie(req: Request): boolean {
  const mode = String(process.env.GOYLORD_AUTH_COOKIE_SECURE || "auto");
  if (envFlagEnabled(mode)) {
    return true;
  }
  if (envFlagDisabled(mode)) {
    return false;
  }

  if (envFlagEnabled(String(process.env.GOYLORD_TLS_OFFLOAD || ""))) {
    return true;
  }

  if (shouldTrustProxyHeaders()) {
    const forwardedProto = req.headers
      .get("x-forwarded-proto")
      ?.split(",")[0]
      ?.trim()
      ?.toLowerCase();
    if (forwardedProto === "https") {
      return true;
    }
    if (forwardedProto === "http") {
      return false;
    }
  }

  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function makeAuthCookie(token: string, maxAgeSeconds: number, req: Request): string {
  const securePart = shouldUseSecureAuthCookie(req) ? "Secure; " : "";
  return `goylord_token=${token}; HttpOnly; ${securePart}SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function makeAuthCookieClear(req: Request): string {
  const securePart = shouldUseSecureAuthCookie(req) ? "Secure; " : "";
  return `goylord_token=; HttpOnly; ${securePart}SameSite=Strict; Path=/; Max-Age=0`;
}
