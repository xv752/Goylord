import { db } from "../connection";
import "../schema";
import { hashToken } from "./token-hash";

export function persistRevokedToken(token: string, expiresAt: number): void {
  db.run(
    `INSERT OR IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)`,
    hashToken(token),
    expiresAt,
  );
}

export function persistRevokedTokenHash(tokenHash: string, expiresAt: number): void {
  db.run(
    `INSERT OR IGNORE INTO revoked_tokens (token_hash, expires_at) VALUES (?, ?)`,
    tokenHash,
    expiresAt,
  );
}

const REVOKED_CACHE_MAX = 5000;
const REVOKED_CACHE_TTL_MS = 60_000;
let revokedHashCache: string[] = [];
let revokedCacheSet = new Set<string>();
let revokedCacheLoadedAt = 0;

function refreshRevokedCache(): void {
  try {
    const now = Math.floor(Date.now() / 1000);
    const rows = db.query<{ token_hash: string }>(
      `SELECT token_hash FROM revoked_tokens WHERE expires_at > ?`,
    ).all(now);
    revokedHashCache = rows.map((r) => r.token_hash);
    revokedCacheSet = new Set(revokedHashCache);
    if (revokedHashCache.length > REVOKED_CACHE_MAX) {
      revokedHashCache = revokedHashCache.slice(revokedHashCache.length - REVOKED_CACHE_MAX);
      revokedCacheSet = new Set(revokedHashCache);
    }
    revokedCacheLoadedAt = Date.now();
  } catch {
    // If DB is down, keep the stale cache rather than clearing it
  }
}

export function isTokenRevoked(token: string): boolean {
  try {
    if (Date.now() - revokedCacheLoadedAt > REVOKED_CACHE_TTL_MS) {
      refreshRevokedCache();
    }
    const tokenHash = hashToken(token);
    if (revokedCacheSet.has(tokenHash)) return true;
    return !!db.query<{ token_hash: string }>(
      `SELECT token_hash FROM revoked_tokens WHERE token_hash=?`,
    ).get(tokenHash);
  } catch {
    return true;
  }
}

export function loadAllRevokedTokenHashes(): Set<string> {
  const now = Math.floor(Date.now() / 1000);
  const rows = db.query<{ token_hash: string }>(
    `SELECT token_hash FROM revoked_tokens WHERE expires_at > ?`,
  ).all(now);
  return new Set(rows.map((r) => r.token_hash));
}

export function pruneExpiredRevokedTokens(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.run(`DELETE FROM revoked_tokens WHERE expires_at <= ?`, now);
  return result.changes;
}
