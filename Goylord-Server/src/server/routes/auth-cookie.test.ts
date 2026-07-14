import { afterEach, describe, expect, test } from "bun:test";
import { shouldUseSecureAuthCookie } from "./auth-cookie";

const ORIGINAL_ENV = {
  GOYLORD_AUTH_COOKIE_SECURE: process.env.GOYLORD_AUTH_COOKIE_SECURE,
  GOYLORD_TLS_OFFLOAD: process.env.GOYLORD_TLS_OFFLOAD,
  GOYLORD_TRUST_PROXY_HEADERS: process.env.GOYLORD_TRUST_PROXY_HEADERS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete (process.env as any)[key];
    else (process.env as any)[key] = value;
  }
});

describe("shouldUseSecureAuthCookie", () => {
  test("does not trust X-Forwarded-Proto by default", () => {
    delete process.env.GOYLORD_AUTH_COOKIE_SECURE;
    delete process.env.GOYLORD_TLS_OFFLOAD;
    delete process.env.GOYLORD_TRUST_PROXY_HEADERS;

    const req = new Request("http://localhost/api/login", {
      headers: { "x-forwarded-proto": "https" },
    });

    expect(shouldUseSecureAuthCookie(req)).toBe(false);
  });

  test("treats TLS offload as externally secure without forwarded headers", () => {
    process.env.GOYLORD_TLS_OFFLOAD = "true";
    delete process.env.GOYLORD_TRUST_PROXY_HEADERS;
    delete process.env.GOYLORD_AUTH_COOKIE_SECURE;

    const req = new Request("http://localhost/api/login");

    expect(shouldUseSecureAuthCookie(req)).toBe(true);
  });

  test("trusts X-Forwarded-Proto when proxy headers are explicitly trusted", () => {
    process.env.GOYLORD_TRUST_PROXY_HEADERS = "true";
    delete process.env.GOYLORD_TLS_OFFLOAD;
    delete process.env.GOYLORD_AUTH_COOKIE_SECURE;

    const req = new Request("http://localhost/api/login", {
      headers: { "x-forwarded-proto": "https" },
    });

    expect(shouldUseSecureAuthCookie(req)).toBe(true);
  });

  test("honors explicit secure override", () => {
    process.env.GOYLORD_AUTH_COOKIE_SECURE = "true";
    const req = new Request("http://localhost/api/login");
    expect(shouldUseSecureAuthCookie(req)).toBe(true);
  });
});
