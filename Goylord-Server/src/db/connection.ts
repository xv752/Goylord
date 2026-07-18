import Database from "bun:sqlite";
import type { Statement } from "bun:sqlite";
import { resolve } from "path";
import { ensureDataDir } from "../paths";
import { existsSync, renameSync, unlinkSync } from "fs";

export interface TypedDatabase extends Omit<Database, "run" | "query" | "prepare"> {
  run(sql: string, ...params: any[]): import("bun:sqlite").Changes;
  query<T = any>(sql: string): Statement<T>;
  prepare<T = any>(sql: string): Statement<T>;
}

const dataDir = ensureDataDir();
export const dbPath = resolve(dataDir, "goylord.db");

function applyPendingDbImport(): void {
  const importPath = dbPath + ".import";
  if (!existsSync(importPath)) return;
  try {
    renameSync(importPath, dbPath);
    for (const ext of ["-wal", "-shm"]) {
      const src = dbPath + ext + ".import";
      const dst = dbPath + ext;
      if (existsSync(src)) renameSync(src, dst);
      else if (existsSync(dst)) { try { unlinkSync(dst); } catch {} }
    }
    console.log("[db] Applied pending database import from backup");
  } catch (e: any) {
    console.error("[db] Failed to apply pending import:", e.message);
  }
}

applyPendingDbImport();

export const db: TypedDatabase = new Database(dbPath) as any;

function numberPragmaEnv(name: string, fallback: number, min: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) return fallback;
  return Math.floor(value);
}

function synchronousPragmaEnv(): string {
  const raw = String(process.env.GOYLORD_SQLITE_SYNCHRONOUS || "NORMAL").toUpperCase();
  if (raw === "OFF" || raw === "NORMAL" || raw === "FULL" || raw === "EXTRA") {
    return raw;
  }
  return "NORMAL";
}

function applyPragma(sql: string): void {
  try {
    db.exec(sql);
  } catch (err) {
    console.warn(`[db] Failed to apply ${sql}:`, err);
  }
}

applyPragma("PRAGMA foreign_keys = ON");
applyPragma("PRAGMA journal_mode = WAL");
applyPragma(`PRAGMA synchronous = ${synchronousPragmaEnv()}`);
applyPragma(`PRAGMA busy_timeout = ${numberPragmaEnv("GOYLORD_SQLITE_BUSY_TIMEOUT_MS", 5000, 0)}`);
applyPragma("PRAGMA temp_store = MEMORY");
applyPragma(`PRAGMA cache_size = ${numberPragmaEnv("GOYLORD_SQLITE_CACHE_SIZE_KB", 32768, 1024) * -1}`);
applyPragma(`PRAGMA mmap_size = ${numberPragmaEnv("GOYLORD_SQLITE_MMAP_SIZE_BYTES", 268435456, 0)}`);
applyPragma(`PRAGMA wal_autocheckpoint = ${numberPragmaEnv("GOYLORD_SQLITE_WAL_AUTOCHECKPOINT", 4000, 1)}`);
applyPragma(`PRAGMA journal_size_limit = ${numberPragmaEnv("GOYLORD_SQLITE_JOURNAL_SIZE_LIMIT_BYTES", 67108864, 0)}`);

console.log(`[db] Using database at: ${dbPath}`);
