import { authenticateRequest } from "../../auth";
import { getConfig, getExportableConfig, importFullConfig } from "../../config";
import { dbPath } from "../../db/connection";
import { SERVER_VERSION } from "../../version";
import { resolveDataDir } from "../../paths";
import { existsSync, readFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import logger from "../../logger";

type BackupRouteDeps = {
  CORS_HEADERS: Record<string, string>;
};

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let v = n;
    for (let k = 0; k < 8; k++) {
      v = v & 1 ? 0xedb88320 ^ (v >>> 1) : v >>> 1;
    }
    table[n] = v;
  }
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const d = ((date.getFullYear() - 1980) & 0x7f) << 9 | ((date.getMonth() + 1) & 0xf) << 5 | (date.getDate() & 0x1f);
  return { time, date: d };
}

function buildZip(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const now = dosDateTime(new Date());
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.data);
    const compressedSize = file.data.length;
    const uncompressedSize = file.data.length;

    // Local file header (30 + name length)
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, now.time, true);
    lv.setUint16(12, now.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localHeaders.push(local);

    // Central directory header (46 + name length)
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, now.time, true);
    cv.setUint16(14, now.date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0x20, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralHeaders.push(central);

    offset += local.length + file.data.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = offset + centralDirSize + 22;
  const zip = new Uint8Array(totalSize);
  let pos = 0;
  for (const lh of localHeaders) { zip.set(lh, pos); pos += lh.length; }
  for (const file of files) { zip.set(file.data, pos); pos += file.data.length; }
  for (const ch of centralHeaders) { zip.set(ch, pos); pos += ch.length; }
  zip.set(eocd, pos);

  return zip;
}

function readJsonSafe(filePath: string): any {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch { return null; }
}

export async function handleBackupRoutes(
  req: Request,
  url: URL,
  deps: BackupRouteDeps,
): Promise<Response | null> {
  // ---- GET /api/backup/export ----
  if (req.method === "GET" && url.pathname === "/api/backup/export") {
    const user = await authenticateRequest(req);
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (user.role !== "admin") return new Response("Forbidden", { status: 403 });

    const encoder = new TextEncoder();
    const dataDir = resolveDataDir();
    const files: { name: string; data: Uint8Array }[] = [];

    // 1. Server config (redacted)
    const configExport = getExportableConfig(SERVER_VERSION);
    files.push({ name: "config.json", data: encoder.encode(JSON.stringify(configExport, null, 2)) });

    // 2. Users
    const users = readJsonSafe(join(dataDir, "users.json"));
    if (users) files.push({ name: "users.json", data: encoder.encode(JSON.stringify(users, null, 2)) });

    // 3. Plugin state
    const pluginState = readJsonSafe(join(dataDir, "plugins", ".plugin-state.json"));
    if (pluginState) files.push({ name: "plugin-state.json", data: encoder.encode(JSON.stringify(pluginState, null, 2)) });

    // 4. Database file
    if (existsSync(dbPath)) {
      const dbBytes = await readFile(dbPath);
      files.push({ name: "database.sqlite", data: new Uint8Array(dbBytes) });
    }

    // 5. WAL file (if exists)
    const walPath = dbPath + "-wal";
    if (existsSync(walPath)) {
      const walBytes = await readFile(walPath);
      files.push({ name: "database.sqlite-wal", data: new Uint8Array(walBytes) });
    }

    // 6. SHM file (if exists)
    const shmPath = dbPath + "-shm";
    if (existsSync(shmPath)) {
      const shmBytes = await readFile(shmPath);
      files.push({ name: "database.sqlite-shm", data: new Uint8Array(shmBytes) });
    }

    // 7. Custom CSS
    const config = getConfig();
    if (config.appearance?.customCSS) {
      files.push({ name: "custom.css", data: encoder.encode(config.appearance.customCSS) });
    }

    logger.info(`[backup] Exporting ${files.length} files for user ${user.username}`);

    const zip = buildZip(files);
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return new Response(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="goylord-backup-${ts}.zip"`,
        ...deps.CORS_HEADERS,
      },
    });
  }

  // ---- POST /api/backup/import ----
  if (req.method === "POST" && url.pathname === "/api/backup/import") {
    const user = await authenticateRequest(req);
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (user.role !== "admin") return new Response("Forbidden", { status: 403 });

    const body = await req.arrayBuffer();
    if (!body || body.byteLength < 22) {
      return new Response(JSON.stringify({ error: "Empty or invalid backup file" }), { status: 400, headers: { "Content-Type": "application/json", ...deps.CORS_HEADERS } });
    }

    const zipBytes = new Uint8Array(body);

    // Parse ZIP: read local file headers
    const decoder = new TextDecoder();
    const entries: { name: string; data: Uint8Array }[] = [];
    let pos = 0;

    while (pos + 30 <= zipBytes.length) {
      const sig = new DataView(zipBytes.buffer, zipBytes.byteOffset + pos, 4).getUint32(0, true);
      if (sig !== 0x04034b50) break;

      const nameLen = new DataView(zipBytes.buffer, zipBytes.byteOffset + pos + 26, 2).getUint32(0, true) & 0xffff;
      const extraLen = new DataView(zipBytes.buffer, zipBytes.byteOffset + pos + 28, 2).getUint32(0, true) & 0xffff;
      const compSize = new DataView(zipBytes.buffer, zipBytes.byteOffset + pos + 18, 4).getUint32(0, true);
      const name = decoder.decode(zipBytes.subarray(pos + 30, pos + 30 + nameLen));
      const dataStart = pos + 30 + nameLen + extraLen;
      const data = zipBytes.slice(dataStart, dataStart + compSize);

      entries.push({ name, data });
      pos = dataStart + compSize;
    }

    const applied: string[] = [];
    const warnings: string[] = [];

    for (const entry of entries) {
      if (entry.name === "config.json") {
        try {
          const configData = JSON.parse(decoder.decode(entry.data));
          const result = await importFullConfig(configData);
          applied.push(...result.applied);
          warnings.push(...result.warnings);
        } catch (e: any) {
          warnings.push(`Failed to import config.json: ${e.message}`);
        }
      } else if (entry.name === "database.sqlite") {
        const dataDir = resolveDataDir();
        const targetPath = join(dataDir, "goylord.db");
        const { writeFileSync } = await import("fs");
        writeFileSync(targetPath, entry.data);
        applied.push("database (restart required to take effect)");
      } else if (entry.name === "database.sqlite-wal") {
        const dataDir = resolveDataDir();
        const { writeFileSync } = await import("fs");
        writeFileSync(join(dataDir, "goylord.db-wal"), entry.data);
      } else if (entry.name === "database.sqlite-shm") {
        const dataDir = resolveDataDir();
        const { writeFileSync } = await import("fs");
        writeFileSync(join(dataDir, "goylord.db-shm"), entry.data);
      } else if (entry.name === "users.json") {
        const dataDir = resolveDataDir();
        const { writeFileSync } = await import("fs");
        writeFileSync(join(dataDir, "users.json"), entry.data);
        applied.push("users.json (restart required)");
      } else if (entry.name === "plugin-state.json") {
        const dataDir = resolveDataDir();
        const { writeFileSync, mkdirSync } = await import("fs");
        const pluginDir = join(dataDir, "plugins");
        if (!existsSync(pluginDir)) mkdirSync(pluginDir, { recursive: true });
        writeFileSync(join(pluginDir, ".plugin-state.json"), entry.data);
        applied.push("plugin-state.json (restart required)");
      } else if (entry.name === "custom.css") {
        const css = decoder.decode(entry.data);
        if (css.length <= 51200) {
          await import("../../config").then(m => m.updateAppearanceConfig(css));
          applied.push("custom.css");
        } else {
          warnings.push("custom.css exceeds 50 KB limit, skipped");
        }
      }
    }

    logger.info(`[backup] Import by user ${user.username}: applied=${applied.join(", ")}`);

    return Response.json({
      ok: applied.length > 0,
      applied,
      warnings,
      message: applied.length > 0
        ? `Restored ${applied.length} item(s). Restart the server for database/user changes to take effect.`
        : "No recognized backup data found in the uploaded file.",
    }, { headers: deps.CORS_HEADERS });
  }

  return null;
}
