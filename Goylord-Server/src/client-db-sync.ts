import { upsertClientRows, type ClientDbRow } from "./db";
import { metrics } from "./metrics";

function positiveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const CLIENT_DB_SYNC_INTERVAL_MS = positiveNumberEnv("GOYLORD_CLIENT_DB_SYNC_MS", 5000);
export const CLIENT_PRESENCE_SYNC_INTERVAL_MS = Math.max(
  CLIENT_DB_SYNC_INTERVAL_MS,
  positiveNumberEnv("GOYLORD_CLIENT_PRESENCE_SYNC_MS", 60_000),
);
export const CLIENT_DB_SYNC_BATCH_SIZE = Math.max(
  1,
  Number(process.env.GOYLORD_CLIENT_DB_SYNC_BATCH_SIZE || 500),
);
export const CLIENT_DB_SYNC_FLUSH_DELAY_MS = Math.max(
  1,
  Number(process.env.GOYLORD_CLIENT_DB_SYNC_FLUSH_DELAY_MS || 100),
);

const lastClientDbSync = new Map<string, number>();
const pendingClientDbUpdates = new Map<string, ClientDbRow>();
let flushSoonTimer: ReturnType<typeof setTimeout> | null = null;

export function queueClientDbUpdate(partial: ClientDbRow): void {
  const existing = pendingClientDbUpdates.get(partial.id);
  if (!existing) {
    pendingClientDbUpdates.set(partial.id, { ...partial });
    return;
  }
  pendingClientDbUpdates.set(partial.id, {
    ...existing,
    ...partial,
    id: partial.id,
    lastSeen: partial.lastSeen ?? existing.lastSeen,
    online: partial.online ?? existing.online,
    pingMs: partial.pingMs ?? existing.pingMs,
  });
}

export function scheduleQueuedClientDbFlush(delayMs = CLIENT_DB_SYNC_FLUSH_DELAY_MS): void {
  if (pendingClientDbUpdates.size === 0 || flushSoonTimer) return;
  flushSoonTimer = setTimeout(() => {
    flushSoonTimer = null;
    flushQueuedClientDbUpdates();
  }, Math.max(1, Math.floor(delayMs)));
}

export function flushQueuedClientDbUpdates(): void {
  if (pendingClientDbUpdates.size === 0) return;

  const startedAt = Date.now();
  let processed = 0;
  const updates: ClientDbRow[] = [];
  for (const [clientId, update] of pendingClientDbUpdates.entries()) {
    updates.push(update);
    pendingClientDbUpdates.delete(clientId);
    processed += 1;
    if (processed >= CLIENT_DB_SYNC_BATCH_SIZE) {
      break;
    }
  }
  upsertClientRows(updates);

  if (pendingClientDbUpdates.size > 0) {
    scheduleQueuedClientDbFlush(25);
  }
  metrics.recordInternalTask("client-db-flush", Date.now() - startedAt);
}

setInterval(flushQueuedClientDbUpdates, CLIENT_DB_SYNC_INTERVAL_MS);

export function shouldSyncClientToDb(clientId: string, now: number): boolean {
  const last = lastClientDbSync.get(clientId) || 0;
  if (now - last < CLIENT_PRESENCE_SYNC_INTERVAL_MS) return false;
  lastClientDbSync.set(clientId, now);
  return true;
}

export function markClientDbSynced(clientId: string, now: number): void {
  lastClientDbSync.set(clientId, now);
}

export function clearClientSyncState(clientId: string): void {
  lastClientDbSync.delete(clientId);
  pendingClientDbUpdates.delete(clientId);
}

export function getClientDbSyncStats(): {
  trackedClients: number;
  pendingUpdates: number;
  flushScheduled: boolean;
} {
  return {
    trackedClients: lastClientDbSync.size,
    pendingUpdates: pendingClientDbUpdates.size,
    flushScheduled: flushSoonTimer !== null,
  };
}

const STALE_SYNC_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export function pruneStaleClientSyncEntries(): void {
  const now = Date.now();
  for (const [clientId, lastSync] of lastClientDbSync.entries()) {
    if (now - lastSync > STALE_SYNC_MAX_AGE_MS) {
      lastClientDbSync.delete(clientId);
    }
  }
}

setInterval(pruneStaleClientSyncEntries, 60 * 60 * 1000);
