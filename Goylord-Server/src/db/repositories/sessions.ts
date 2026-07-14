import { db } from "../connection";
import "../schema";
import { hashToken } from "./token-hash";

export type SessionRecord = {
  id: string;
  userId: number;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  lastActivity: number;
  expiresAt: number;
  revoked: boolean;
};

export function createSession(session: {
  id: string;
  userId: number;
  tokenHash: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: number;
  expiresAt: number;
}): void {
  db.run(
    `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, created_at, last_activity, expires_at, revoked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    session.id,
    session.userId,
    session.tokenHash,
    session.ip,
    session.userAgent,
    session.createdAt,
    session.createdAt,
    session.expiresAt,
  );
}

export function getSessionByTokenHash(tokenHash: string): SessionRecord | null {
  const row = db.query<any>(
    `SELECT * FROM sessions WHERE token_hash=? AND revoked=0`,
  ).get(tokenHash);
  if (!row) return null;
  return mapSessionRow(row);
}

export function getSessionById(id: string): SessionRecord | null {
  const row = db.query<any>(`SELECT * FROM sessions WHERE id=?`).get(id);
  if (!row) return null;
  return mapSessionRow(row);
}

export function listUserSessions(userId: number): SessionRecord[] {
  const rows = db.query<any>(
    `SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC`,
  ).all(userId);
  return rows.map(mapSessionRow);
}

export function updateSessionActivity(tokenHash: string): void {
  const now = Math.floor(Date.now() / 1000);
  db.run(`UPDATE sessions SET last_activity=? WHERE token_hash=? AND revoked=0`, now, tokenHash);
}

export function revokeSessionByTokenHash(tokenHash: string): boolean {
  const result = db.run(`UPDATE sessions SET revoked=1 WHERE token_hash=? AND revoked=0`, tokenHash);
  return result.changes > 0;
}

export function revokeSessionById(sessionId: string): { tokenHash: string | null } {
  const row = db.query<{ token_hash: string }>(
    `SELECT token_hash FROM sessions WHERE id=? AND revoked=0`,
  ).get(sessionId);
  if (!row) return { tokenHash: null };
  db.run(`UPDATE sessions SET revoked=1 WHERE id=?`, sessionId);
  return { tokenHash: row.token_hash };
}

export function revokeAllUserSessions(userId: number): number {
  const result = db.run(`UPDATE sessions SET revoked=1 WHERE user_id=? AND revoked=0`, userId);
  return result.changes;
}

export function pruneExpiredSessions(): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.run(`DELETE FROM sessions WHERE expires_at <= ?`, now);
  return result.changes;
}

export function hashTokenForSession(token: string): string {
  return hashToken(token);
}

export function deleteInactiveSessions(userId: number): number {
  const now = Math.floor(Date.now() / 1000);
  const result = db.run(
    `DELETE FROM sessions WHERE user_id = ? AND (revoked = 1 OR expires_at <= ?)`,
    userId,
    now,
  );
  return result.changes;
}

function mapSessionRow(row: any): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
    lastActivity: row.last_activity,
    expiresAt: row.expires_at,
    revoked: !!row.revoked,
  };
}
