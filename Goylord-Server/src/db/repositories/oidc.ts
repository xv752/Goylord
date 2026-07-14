import { db } from "../connection";
import "../schema";

export type OidcAuthState = {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string | null;
  createdAt: number;
  expiresAt: number;
};

export type OidcIdentityRecord = {
  issuer: string;
  subject: string;
  userId: number;
  email: string | null;
  username: string | null;
  createdAt: number;
  lastLogin: number;
};

export function saveOidcAuthState(record: OidcAuthState): void {
  db.run(
    `INSERT INTO oidc_auth_states (state, nonce, code_verifier, return_to, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    record.state,
    record.nonce,
    record.codeVerifier,
    record.returnTo,
    record.createdAt,
    record.expiresAt,
  );
}

export function takeOidcAuthState(state: string): OidcAuthState | null {
  const row = db.query<any>(`SELECT * FROM oidc_auth_states WHERE state=?`).get(state);
  if (!row) return null;
  db.run(`DELETE FROM oidc_auth_states WHERE state=?`, state);
  return {
    state: row.state,
    nonce: row.nonce,
    codeVerifier: row.code_verifier,
    returnTo: row.return_to,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export function pruneExpiredOidcAuthStates(now = Date.now()): number {
  const result = db.run(`DELETE FROM oidc_auth_states WHERE expires_at <= ?`, now);
  return result.changes;
}

export function getOidcIdentity(issuer: string, subject: string): OidcIdentityRecord | null {
  const row = db.query<any>(
    `SELECT * FROM oidc_identities WHERE issuer=? AND subject=?`,
  ).get(issuer, subject);
  return row ? mapIdentity(row) : null;
}

export function getOidcIdentityByEmail(issuer: string, email: string): OidcIdentityRecord | null {
  const row = db.query<any>(
    `SELECT * FROM oidc_identities WHERE issuer=? AND LOWER(email)=LOWER(?) LIMIT 1`,
  ).get(issuer, email);
  return row ? mapIdentity(row) : null;
}

export function upsertOidcIdentity(input: {
  issuer: string;
  subject: string;
  userId: number;
  email?: string | null;
  username?: string | null;
  now?: number;
}): void {
  const now = input.now ?? Date.now();
  db.run(
    `INSERT INTO oidc_identities (issuer, subject, user_id, email, username, created_at, last_login)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(issuer, subject) DO UPDATE SET
       user_id=excluded.user_id,
       email=excluded.email,
       username=excluded.username,
       last_login=excluded.last_login`,
    input.issuer,
    input.subject,
    input.userId,
    input.email || null,
    input.username || null,
    now,
    now,
  );
}

function mapIdentity(row: any): OidcIdentityRecord {
  return {
    issuer: row.issuer,
    subject: row.subject,
    userId: row.user_id,
    email: row.email || null,
    username: row.username || null,
    createdAt: row.created_at,
    lastLogin: row.last_login,
  };
}
