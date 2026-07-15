function generateCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

export function csrfMiddleware(req: Request): Response | null {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return null;
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const cookies = req.headers.get("Cookie") || "";
  const hasSession = cookies.split(";").some(c => c.trim().startsWith("goylord_token="));
  if (!hasSession) {
    return null;
  }

  const token = req.headers.get("X-CSRF-Token") ||
                new URL(req.url).searchParams.get("_csrf");

  const csrfCookie = cookies.split(";")
    .map(c => c.trim())
    .find(c => c.startsWith("csrf_token="))
    ?.split("=")?.[1];

  if (!csrfCookie || !token || token !== csrfCookie) {
    return new Response(JSON.stringify({ error: "CSRF token mismatch" }), {
      status: 403,
      headers: { "Content-Type": "application/json" }
    });
  }

  return null;
}

export function setCsrfCookie(headers: Headers): void {
  const token = generateCsrfToken();
  headers.append("Set-Cookie", `csrf_token=${token}; Path=/; HttpOnly=false; SameSite=Strict`);
}
