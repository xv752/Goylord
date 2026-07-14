import { existsSync, mkdirSync, rmSync, statSync } from "fs";
import path from "path";

type Scenario = "legacy-immediate" | "batched";

type Options = {
  clients: number;
  batchSizes: number[];
  reads: boolean;
  keep: boolean;
  worker: boolean;
  mode: Scenario;
  batchSize: number;
  dataDir?: string;
};

type Result = {
  mode: Scenario;
  clients: number;
  batchSize: number;
  reads: boolean;
  durationMs: number;
  clientsPerSecond: number;
  writeTransactions: number;
  rowCount: number;
  dbBytes: number;
  walBytes: number;
  shmBytes: number;
  dataDir: string;
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefix));
  if (direct) return direct.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return undefined;
}

function hasArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.floor(value);
}

function parseOptions(): Options {
  const batchRaw = argValue("batch-sizes") || argValue("batch-size") || "500,1000";
  const batchSizes = batchRaw
    .split(",")
    .map((part) => parsePositiveInt(part.trim(), 0))
    .filter((value) => value > 0);
  const mode = (argValue("mode") || "batched") as Scenario;

  return {
    clients: parsePositiveInt(argValue("clients"), 10_000),
    batchSizes: batchSizes.length > 0 ? batchSizes : [500],
    reads: argValue("reads") !== "false",
    keep: hasArg("keep"),
    worker: hasArg("worker"),
    mode: mode === "legacy-immediate" ? "legacy-immediate" : "batched",
    batchSize: parsePositiveInt(argValue("batch-size"), 500),
    dataDir: argValue("data-dir"),
  };
}

function makeClientRow(index: number, now: number) {
  const id = `bench-client-${String(index).padStart(7, "0")}`;
  return {
    id,
    hwid: `bench-hwid-${String(index).padStart(7, "0")}`,
    role: "client",
    ip: `10.${(index >> 16) & 255}.${(index >> 8) & 255}.${index & 255}`,
    host: `bench-host-${index}`,
    os: index % 3 === 0 ? "Windows 11" : index % 3 === 1 ? "Windows 10" : "Linux",
    arch: "amd64",
    version: "bench",
    user: `bench-user-${index % 1000}`,
    monitors: 1 + (index % 4),
    country: "US",
    cpu: "bench-cpu",
    gpu: "bench-gpu",
    ram: "16 GB",
    publicKey: `bench-public-key-${String(index).padStart(7, "0")}`,
    keyFingerprint: `bench-fingerprint-${String(index).padStart(7, "0")}`,
    enrollmentStatus: "approved",
    online: 1,
    lastSeen: now + index,
    pingMs: index % 250,
    isAdmin: false,
  };
}

function fileSize(filePath: string): number {
  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function printTable(results: Result[]): void {
  const rows = results.map((result) => ({
    mode: result.mode,
    clients: String(result.clients),
    batch: String(result.batchSize),
    reads: result.reads ? "yes" : "no",
    ms: result.durationMs.toFixed(1),
    perSec: result.clientsPerSecond.toFixed(0),
    tx: String(result.writeTransactions),
    dbMB: (result.dbBytes / 1024 / 1024).toFixed(1),
    walMB: (result.walBytes / 1024 / 1024).toFixed(1),
  }));

  const headers = ["mode", "clients", "batch", "reads", "ms", "perSec", "tx", "dbMB", "walMB"];
  const widths = headers.map((header) =>
    Math.max(header.length, ...rows.map((row) => row[header as keyof typeof row].length)),
  );
  const line = headers.map((header, i) => header.padEnd(widths[i])).join("  ");
  console.log(line);
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    console.log(headers.map((header, i) => row[header as keyof typeof row].padEnd(widths[i])).join("  "));
  }
}

async function runWorker(options: Options): Promise<void> {
  if (!options.dataDir) {
    throw new Error("--data-dir is required in worker mode");
  }
  process.env.DATA_DIR = options.dataDir;
  process.env.NODE_ENV = "test";
  process.env.GOYLORD_CLIENT_DB_SYNC_BATCH_SIZE = String(options.batchSize);

  const repo = await import("../src/db/repositories");
  const { db, dbPath } = await import("../src/db/connection");
  const startedAt = performance.now();
  const now = Date.now();
  let writeTransactions = 0;

  if (options.mode === "legacy-immediate") {
    for (let index = 0; index < options.clients; index += 1) {
      const row = makeClientRow(index, now);
      if (options.reads) {
        repo.lookupClientByPublicKey(row.publicKey);
        repo.getClientPublicKeyById(row.id);
        repo.clientExists(row.id);
      }
      repo.upsertClientRows([row]);
      writeTransactions += 1;
    }
  } else {
    let batch: ReturnType<typeof makeClientRow>[] = [];
    for (let index = 0; index < options.clients; index += 1) {
      const row = makeClientRow(index, now);
      if (options.reads) {
        repo.lookupClientByPublicKey(row.publicKey);
        repo.getClientPublicKeyById(row.id);
        repo.clientExists(row.id);
      }
      batch.push(row);
      if (batch.length >= options.batchSize) {
        repo.upsertClientRows(batch);
        writeTransactions += 1;
        batch = [];
      }
    }
    if (batch.length > 0) {
      repo.upsertClientRows(batch);
      writeTransactions += 1;
    }
  }

  const durationMs = performance.now() - startedAt;
  const row = db.query<{ count: number }>("SELECT COUNT(*) as count FROM clients").get();
  const result: Result = {
    mode: options.mode,
    clients: options.clients,
    batchSize: options.mode === "legacy-immediate" ? 1 : options.batchSize,
    reads: options.reads,
    durationMs,
    clientsPerSecond: options.clients / (durationMs / 1000),
    writeTransactions,
    rowCount: Number(row?.count || 0),
    dbBytes: fileSize(dbPath),
    walBytes: fileSize(`${dbPath}-wal`),
    shmBytes: fileSize(`${dbPath}-shm`),
    dataDir: options.dataDir,
  };

  console.log(JSON.stringify(result));
}

function runScenario(mode: Scenario, batchSize: number, options: Options, rootDir: string): Result {
  const dataDir = path.join(rootDir, `${mode}-${batchSize}`);
  if (existsSync(dataDir)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
  mkdirSync(dataDir, { recursive: true });

  const args = [
    "run",
    import.meta.path,
    "--worker",
    `--mode=${mode}`,
    `--clients=${options.clients}`,
    `--batch-size=${batchSize}`,
    `--data-dir=${dataDir}`,
    `--reads=${options.reads ? "true" : "false"}`,
  ];
  const child = Bun.spawnSync({
    cmd: [process.execPath, ...args],
    cwd: process.cwd(),
    env: { ...process.env, DATA_DIR: dataDir, NODE_ENV: "test" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = child.stdout.toString().trim();
  const stderr = child.stderr.toString().trim();
  if (child.exitCode !== 0) {
    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);
    throw new Error(`${mode} failed with exit code ${child.exitCode}`);
  }
  if (stderr) {
    const interesting = stderr
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.includes("Cannot read file \"C:\\\""));
    if (interesting.length > 0) console.error(interesting.join("\n"));
  }

  const jsonLine = stdout
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error(`No result JSON found for ${mode}. Output:\n${stdout}`);
  }
  return JSON.parse(jsonLine) as Result;
}

async function main(): Promise<void> {
  const options = parseOptions();
  if (options.worker) {
    await runWorker(options);
    return;
  }

  const rootDir = path.resolve(options.dataDir || path.join(process.cwd(), ".bench-data", `client-db-${Date.now()}`));
  mkdirSync(rootDir, { recursive: true });

  const results: Result[] = [];
  try {
    results.push(runScenario("legacy-immediate", 1, options, rootDir));
    for (const batchSize of options.batchSizes) {
      results.push(runScenario("batched", batchSize, options, rootDir));
    }
    printTable(results);
    console.log("");
    console.log(JSON.stringify(results, null, 2));
  } finally {
    if (!options.keep && existsSync(rootDir)) {
      rmSync(rootDir, { recursive: true, force: true });
    } else {
      console.log(`Kept benchmark data at ${rootDir}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
