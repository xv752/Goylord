import path from "path";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";

let fallbackTestDataDir = "";

function createFallbackTestDataDir(): string {
  if (fallbackTestDataDir) return fallbackTestDataDir;
  const dir = mkdtempSync(path.join(tmpdir(), "goylord-bun-test-"));
  writeFileSync(path.join(dir, "config.json"), "{}\n", "utf8");
  process.env.DATA_DIR = dir;
  process.env.GOYLORD_TEST_DATA_DIR = "1";
  fallbackTestDataDir = dir;
  return dir;
}

function assertSafeTestDataDir(dir: string): void {
  if (String(process.env.NODE_ENV || "").toLowerCase() !== "test") return;

  const lower = dir.toLowerCase();
  const appData = (process.env.APPDATA || "").toLowerCase();
  if (appData && lower.startsWith(appData)) {
    throw new Error(`Refusing to use APPDATA directory in tests: ${dir}`);
  }
}

export function resolveDataDir(): string {
  const envDir = process.env.DATA_DIR;
  if (envDir && envDir.trim()) {
    const resolved = path.resolve(envDir.trim());
    assertSafeTestDataDir(resolved);
    return resolved;
  }

  if (String(process.env.NODE_ENV || "").toLowerCase() === "test") {
    return createFallbackTestDataDir();
  }

  if (process.platform === "win32" && process.env.APPDATA) {
    return path.join(process.env.APPDATA, "Goylord");
  }
  if (process.platform === "darwin") {
    return path.join(tmpdir(), "goylord");
  }
  return path.join(process.cwd(), "data");
}

export function ensureDataDir(): string {
  const dir = resolveDataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}
