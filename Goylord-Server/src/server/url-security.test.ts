import { describe, expect, test } from "bun:test";
import { isPrivateOrLocalAddress, validatePublicHttpUrl } from "./url-security";

describe("isPrivateOrLocalAddress", () => {
  test("flags local and private IPv4 ranges", () => {
    expect(isPrivateOrLocalAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalAddress("10.1.2.3")).toBe(true);
    expect(isPrivateOrLocalAddress("172.16.0.1")).toBe(true);
    expect(isPrivateOrLocalAddress("192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalAddress("169.254.169.254")).toBe(true);
  });

  test("flags local and private IPv6 ranges", () => {
    expect(isPrivateOrLocalAddress("::1")).toBe(true);
    expect(isPrivateOrLocalAddress("fe80::1")).toBe(true);
    expect(isPrivateOrLocalAddress("fd00::1")).toBe(true);
    expect(isPrivateOrLocalAddress("::ffff:127.0.0.1")).toBe(true);
  });

  test("allows public addresses", () => {
    expect(isPrivateOrLocalAddress("8.8.8.8")).toBe(false);
    expect(isPrivateOrLocalAddress("2001:4860:4860::8888")).toBe(false);
  });
});

describe("validatePublicHttpUrl", () => {
  test("rejects localhost and credentialed URLs", async () => {
    await expect(validatePublicHttpUrl("http://localhost/file.bin")).rejects.toThrow();
    await expect(validatePublicHttpUrl("https://user:pass@example.com/file.bin")).rejects.toThrow();
  });

  test("rejects hostnames that resolve to private addresses", async () => {
    await expect(
      validatePublicHttpUrl("https://example.test/file.bin", async () => [{ address: "10.0.0.5" }]),
    ).rejects.toThrow("private/internal");
  });

  test("allows hostnames that resolve to public addresses", async () => {
    const parsed = await validatePublicHttpUrl(
      "https://example.test/file.bin",
      async () => [{ address: "203.0.113.10" }],
    );
    expect(parsed.hostname).toBe("example.test");
  });
});
