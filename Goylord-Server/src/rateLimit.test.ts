import { beforeEach, describe, expect, test } from "bun:test";
import { getConfig } from "./config";
import {
  clearRequestRateLimitsForTests,
  consumeLoginPageRateLimit,
  consumeSolRpcRateLimit,
  consumeUnauthorizedRateLimit,
  isRateLimited,
  recordFailedAttempt,
  recordSuccessfulAttempt,
} from "./rateLimit";

beforeEach(() => {
  clearRequestRateLimitsForTests();
});

describe("rateLimit", () => {
  test("locks out after repeated failures", () => {
    const maxAttempts = Math.max(1, Number(getConfig().security.loginMaxAttempts) || 5);
    const ip = `10.0.0.${Date.now()}`;
    for (let i = 0; i < maxAttempts; i += 1) {
      recordFailedAttempt(ip);
    }

    const result = isRateLimited(ip);
    expect(result.limited).toBe(true);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("successful attempt clears lock state", () => {
    const maxAttempts = Math.max(1, Number(getConfig().security.loginMaxAttempts) || 5);
    const ip = `10.0.1.${Date.now()}`;
    for (let i = 0; i < maxAttempts; i += 1) {
      recordFailedAttempt(ip);
    }
    expect(isRateLimited(ip).limited).toBe(true);

    recordSuccessfulAttempt(ip);
    expect(isRateLimited(ip).limited).toBe(false);
  });

  test("limits repeated login page requests by IP", () => {
    const ip = `10.0.2.${Date.now()}`;
    for (let i = 0; i < 60; i += 1) {
      expect(consumeLoginPageRateLimit(ip).limited).toBe(false);
    }

    const result = consumeLoginPageRateLimit(ip);
    expect(result.limited).toBe(true);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("limits repeated unauthorized responses by IP", () => {
    const ip = `10.0.3.${Date.now()}`;
    for (let i = 0; i < 120; i += 1) {
      expect(consumeUnauthorizedRateLimit(ip).limited).toBe(false);
    }

    const result = consumeUnauthorizedRateLimit(ip);
    expect(result.limited).toBe(true);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  test("applies separate Solana publish and balance limits per user", () => {
    const userId = Date.now();
    for (let i = 0; i < 3; i += 1) {
      expect(consumeSolRpcRateLimit(userId, "publish").limited).toBe(false);
    }
    expect(consumeSolRpcRateLimit(userId, "publish").limited).toBe(true);
    expect(consumeSolRpcRateLimit(userId, "balance").limited).toBe(false);
    expect(consumeSolRpcRateLimit(userId + 1, "publish").limited).toBe(false);
  });
});
