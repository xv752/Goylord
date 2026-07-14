import { describe, expect, test } from "bun:test";
import { createQrSvg } from "./qr";

describe("qr svg", () => {
  test("creates an inline SVG QR for otpauth payloads", () => {
    const svg = createQrSvg(
      "otpauth://totp/Goylord:admin?secret=JBSWY3DPEHPK3PXP&issuer=Goylord&algorithm=SHA1&digits=6&period=30",
    );

    expect(svg).toContain("<svg");
    expect(svg).toContain("aria-label=\"MFA setup QR code\"");
    expect(svg).toContain("<rect");
  });

  test("supports larger payloads through the QR library", () => {
    const svg = createQrSvg("x".repeat(200));
    expect(svg).toContain("<svg");
    expect(svg).toContain("viewBox=");
  });
});
