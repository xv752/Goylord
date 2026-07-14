import { logger } from "../logger";
import type { ClientInfo } from "../types";

type PruneStaleClientsParams = {
  clients: Map<string, ClientInfo>;
  staleMs: number;
  pruneBatch: number;
  setOnlineState: (id: string, online: boolean) => void;
  deleteClient: (id: string) => void;
};

export function pruneStaleClients(params: PruneStaleClientsParams): void {
  const now = Date.now();
  const staleIds: string[] = [];

  for (const [id, info] of params.clients.entries()) {
    if (now - info.lastSeen <= params.staleMs) continue;
    staleIds.push(id);
    if (staleIds.length >= params.pruneBatch) break;
  }

  let processed = 0;
  for (const id of staleIds) {
    const info = params.clients.get(id);
    if (!info) continue;

    try {
      if (info.role === "client") {
        info.ws.close(4000, "stale");
      } else {
        info.ws.close();
      }
    } catch (err) {
      logger.error(`[prune] close failed for ${id}`, err);
    }

    params.setOnlineState(id, false);
    params.deleteClient(id);
    processed += 1;
  }

  if (processed > 0) {
    logger.debug(`[prune] pruned ${processed} stale sockets`);
  }
}
