import { describe, expect, test } from "bun:test";
import { buildTotpUri, generateMfaSecret, generateTotpCode, verifyTotpCode } from "./mfa";

describe("mfa totp", () => {
  test("matches RFC 6238 test vector with 8 digits", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(generateTotpCode(secret, 59_000, 8)).toBe("94287082");
  });

  test("verifies current and adjacent window codes", () => {
    const secret = generateMfaSecret();
    const now = Date.now();
    const code = generateTotpCode(secret, now);

    expect(verifyTotpCode(secret, code, now)).toBe(true);
    expect(verifyTotpCode(secret, "000000", now)).toBe(false);
  });

  test("builds an authenticator URI", () => {
    const uri = buildTotpUri({
      issuer: "Goylord",
      accountName: "admin",
      secret: "JBSWY3DPEHPK3PXP",
    });

    expect(uri).toContain("otpauth://totp/");
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=Goylord");
  });
});
