import { db } from "../connection";
import "../schema";

export type ChatMessageRecord = {
  id: number;
  userId: number;
  username: string;
  userRole: string;
  message: string;
  createdAt: number;
};

export function insertChatMessage(userId: number, username: string, userRole: string, message: string): ChatMessageRecord {
  const createdAt = Date.now();
  const result = db.run(
    `INSERT INTO chat_messages (user_id, username, user_role, message, created_at) VALUES (?, ?, ?, ?, ?)`,
    userId,
    username,
    userRole,
    message,
    createdAt,
  );
  const id = Number((result as any).lastInsertRowid);
  return { id, userId, username, userRole, message, createdAt };
}

export function getChatHistory(before?: number, limit: number = 50, retentionMs?: number): ChatMessageRecord[] {
  const maxLimit = Math.min(Math.max(1, limit), 200);
  const cutoff = retentionMs && retentionMs > 0 ? Date.now() - retentionMs : 0;
  let rows: any[];
  if (before) {
    if (cutoff > 0) {
      rows = db.query<any>(
        `SELECT id, user_id, username, user_role, message, created_at FROM chat_messages WHERE created_at < ? AND created_at > ? ORDER BY created_at DESC LIMIT ?`,
      ).all(before, cutoff, maxLimit);
    } else {
      rows = db.query<any>(
        `SELECT id, user_id, username, user_role, message, created_at FROM chat_messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`,
      ).all(before, maxLimit);
    }
  } else {
    if (cutoff > 0) {
      rows = db.query<any>(
        `SELECT id, user_id, username, user_role, message, created_at FROM chat_messages WHERE created_at > ? ORDER BY created_at DESC LIMIT ?`,
      ).all(cutoff, maxLimit);
    } else {
      rows = db.query<any>(
        `SELECT id, user_id, username, user_role, message, created_at FROM chat_messages ORDER BY created_at DESC LIMIT ?`,
      ).all(maxLimit);
    }
  }
  return rows.map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    username: r.username,
    userRole: r.user_role,
    message: r.message,
    createdAt: r.created_at,
  })).reverse();
}

export function deleteExpiredChatMessages(retentionMs: number): number {
  if (retentionMs <= 0) return 0;
  const cutoff = Date.now() - retentionMs;
  const result = db.run(`DELETE FROM chat_messages WHERE created_at < ?`, cutoff);
  return Number((result as any).changes ?? 0);
}
