import { logger } from "./logger";
import { getConfig } from "./config";

interface UserBuildEntry {
  buildTimestamps: number[];
  activeBuildCount: number;
}

const buildStore = new Map<number, UserBuildEntry>();
let globalActiveBuildCount = 0;

const CLEANUP_INTERVAL = 60 * 1000;

function getPolicy() {
  const cfg = getConfig().buildRateLimit;
  return {
    maxBuildsPerHour: Math.min(100, Math.max(1, Number(cfg.maxBuildsPerHour) || 5)),
    maxConcurrentPerUser: Math.min(10, Math.max(1, Number(cfg.maxConcurrentPerUser) || 1)),
    globalMaxConcurrent: Math.min(50, Math.max(1, Number(cfg.globalMaxConcurrent) || 3)),
  };
}

export function canUserBuild(userId: number): {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
} {
  const policy = getPolicy();
  const now = Date.now();
  const hourAgo = now - 60 * 60 * 1000;

  if (globalActiveBuildCount >= policy.globalMaxConcurrent) {
    return {
      allowed: false,
      reason: `Server is at maximum concurrent builds (${policy.globalMaxConcurrent}). Please wait for a build to finish.`,
    };
  }

  const entry = buildStore.get(userId);
  if (!entry) {
    return { allowed: true };
  }

  if (entry.activeBuildCount >= policy.maxConcurrentPerUser) {
    return {
      allowed: false,
      reason: `You already have ${entry.activeBuildCount} build(s) running. Max concurrent per user: ${policy.maxConcurrentPerUser}.`,
    };
  }

  const recentBuilds = entry.buildTimestamps.filter((ts) => ts > hourAgo);
  if (recentBuilds.length >= policy.maxBuildsPerHour) {
    const oldestRecent = Math.min(...recentBuilds);
    const retryAfter = Math.ceil((oldestRecent + 60 * 60 * 1000 - now) / 1000);
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${policy.maxBuildsPerHour} builds per hour. Try again in ${retryAfter}s.`,
      retryAfter,
    };
  }

  return { allowed: true };
}

export function recordBuildStart(userId: number): void {
  const now = Date.now();
  const entry = buildStore.get(userId);

  if (entry) {
    entry.buildTimestamps.push(now);
    entry.activeBuildCount++;
  } else {
    buildStore.set(userId, {
      buildTimestamps: [now],
      activeBuildCount: 1,
    });
  }

  globalActiveBuildCount++;
  logger.debug(
    `[build-rate-limit] User ${userId} started build (active: ${buildStore.get(userId)!.activeBuildCount}, global: ${globalActiveBuildCount})`,
  );
}

export function recordBuildEnd(userId: number): void {
  const entry = buildStore.get(userId);
  if (entry && entry.activeBuildCount > 0) {
    entry.activeBuildCount--;
  }
  if (globalActiveBuildCount > 0) {
    globalActiveBuildCount--;
  }
  logger.debug(
    `[build-rate-limit] User ${userId} build ended (active: ${entry?.activeBuildCount ?? 0}, global: ${globalActiveBuildCount})`,
  );
}

export function getBuildRateLimitStats(): {
  globalActive: number;
  perUser: Array<{ userId: number; active: number; recentCount: number }>;
} {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const perUser: Array<{ userId: number; active: number; recentCount: number }> = [];

  for (const [userId, entry] of buildStore.entries()) {
    const recentCount = entry.buildTimestamps.filter((ts) => ts > hourAgo).length;
    if (entry.activeBuildCount > 0 || recentCount > 0) {
      perUser.push({ userId, active: entry.activeBuildCount, recentCount });
    }
  }

  return { globalActive: globalActiveBuildCount, perUser };
}

function cleanupExpired(): void {
  const hourAgo = Date.now() - 60 * 60 * 1000;
  let cleaned = 0;

  for (const [userId, entry] of buildStore.entries()) {
    entry.buildTimestamps = entry.buildTimestamps.filter((ts) => ts > hourAgo);

    if (entry.buildTimestamps.length === 0 && entry.activeBuildCount <= 0) {
      buildStore.delete(userId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`[build-rate-limit] Cleaned up ${cleaned} expired entries`);
  }
}

setInterval(cleanupExpired, CLEANUP_INTERVAL);
