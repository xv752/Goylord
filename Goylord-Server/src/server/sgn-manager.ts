import fs from "fs";
import path from "path";
import { $ } from "bun";
import { ensureDataDir } from "../paths";
import { logger } from "../logger";

const SGN_REPO = "EgeBalci/sgn";
const VERSION_TTL_MS = 24 * 60 * 60 * 1000;

type CachedVersion = { tag: string; cachedAt: number };

function toolsDir(): string {
  return path.join(ensureDataDir(), "tools");
}

function binaryPath(): string {
  return path.join(toolsDir(), process.platform === "win32" ? "sgn.exe" : "sgn");
}

function versionFilePath(): string {
  return path.join(toolsDir(), "sgn.version");
}

function readCache(): CachedVersion | null {
  try { return JSON.parse(fs.readFileSync(versionFilePath(), "utf8")); } catch { return null; }
}

function writeCache(tag: string): void {
  try {
    fs.mkdirSync(toolsDir(), { recursive: true });
    fs.writeFileSync(versionFilePath(), JSON.stringify({ tag, cachedAt: Date.now() }));
  } catch {}
}

async function findSystemSgn(): Promise<string | null> {
  const systemCandidates = ["/usr/local/bin/sgn", "/usr/bin/sgn", "/go/bin/sgn"];
  for (const c of systemCandidates) {
    if (fs.existsSync(c)) return c;
  }
  const fromPath = Bun.which("sgn");
  if (fromPath) return fromPath;
  return null;
}

type AssetInfo = { tag: string; downloadUrl: string; assetName: string };

async function fetchLatest(): Promise<AssetInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${SGN_REPO}/releases/latest`,
      { headers: { "User-Agent": "Goylord-C2", Accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return null;
    const data = await res.json() as any;
    const tag: string = data.tag_name;
    const assets: { name: string; browser_download_url: string }[] = data.assets ?? [];

    // SGN release is named sgn_<os>_<arch>_<version>.zip
    const osTag = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "macos" : "linux";
    const archTag = process.arch === "x64" ? "amd64" : process.arch === "ia32" ? "386" : process.arch;

    const exact = assets.find(a => {
      const n = a.name.toLowerCase();
      return n.startsWith(`sgn_${osTag}_${archTag}`) && n.endsWith(".zip");
    });
    if (exact) return { tag, downloadUrl: exact.browser_download_url, assetName: exact.name };

    const looseOs = assets.find(a => a.name.toLowerCase().includes(`_${osTag}_`) && a.name.endsWith(".zip"));
    if (looseOs) return { tag, downloadUrl: looseOs.browser_download_url, assetName: looseOs.name };

    return null;
  } catch {
    return null;
  }
}

async function downloadAndExtract(url: string, dest: string): Promise<boolean> {
  try {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    const tmpZip = dest + ".tmp.zip";
    fs.writeFileSync(tmpZip, Buffer.from(buf));
    try {
      const destDir = path.dirname(dest);
      const binName = process.platform === "win32" ? "sgn.exe" : "sgn";
      const r = await $`unzip -o -j ${tmpZip} -d ${destDir}`.nothrow().quiet();
      if (r.exitCode !== 0) return false;
      const extracted = path.join(destDir, binName);
      if (!fs.existsSync(extracted)) {
        const entries = fs.readdirSync(destDir);
        const found = entries.find(e => e.toLowerCase().startsWith("sgn") && !e.endsWith(".version") && !e.endsWith(".tmp.zip"));
        if (!found) return false;
        fs.renameSync(path.join(destDir, found), dest);
      } else if (extracted !== dest) {
        fs.renameSync(extracted, dest);
      }
      try { fs.chmodSync(dest, 0o755); } catch {}
      return true;
    } finally {
      try { fs.unlinkSync(tmpZip); } catch {}
    }
  } catch {
    return false;
  }
}

export async function ensureSgn(
  sendToStream?: (data: any) => void,
): Promise<string | null> {
  const bin = binaryPath();
  const cached = readCache();
  const binExists = fs.existsSync(bin);
  const stale = !cached || Date.now() - cached.cachedAt > VERSION_TTL_MS;

  const log = (text: string, level = "info") => {
    logger.info(`[sgn] ${text.trim()}`);
    sendToStream?.({ type: "output", text: `${text}\n`, level });
  };

  if (binExists && !stale) {
    log(`SGN: using cached ${cached!.tag}`);
    return bin;
  }

  const sysBinEarly = await findSystemSgn();
  if (sysBinEarly) {
    log(`SGN: using system binary at ${sysBinEarly}`);
    writeCache("system");
    return sysBinEarly;
  }

  log("SGN: checking GitHub for latest release…");
  const latest = await fetchLatest();
  if (!latest) {
    if (binExists) {
      log(`SGN: GitHub unreachable — using cached ${cached?.tag ?? "unknown"}`, "warn");
      return bin;
    }
    log("SGN: GitHub unreachable and no binary available", "error");
    return null;
  }

  if (binExists && cached?.tag === latest.tag) {
    log(`SGN: already at latest (${latest.tag})`);
    writeCache(latest.tag);
    return bin;
  }

  log(`SGN: downloading ${latest.assetName}…`);
  const ok = await downloadAndExtract(latest.downloadUrl, bin);
  if (!ok) {
    if (binExists) {
      log(`SGN: download failed — using cached ${cached?.tag ?? "unknown"}`, "warn");
      return bin;
    }
    log("SGN: download failed and no cached binary available", "error");
    return null;
  }

  writeCache(latest.tag);
  log(`SGN: ready (${latest.tag})`);
  return bin;
}

export async function runSgn(
  inputBin: string,
  outputBin: string,
  arch: "amd64" | "386",
  iterations: number,
  sendToStream: (data: any) => void,
): Promise<boolean> {
  const bin = await ensureSgn(sendToStream);
  if (!bin) {
    sendToStream({ type: "output", text: "ERROR: SGN binary not available\n", level: "error" });
    return false;
  }

  const archFlag = arch === "386" ? "32" : "64";
  const enc = Math.max(1, Math.min(50, Math.floor(iterations || 1)));

  const tmpOut = outputBin + ".sgn.tmp";
  try {
    try { fs.unlinkSync(tmpOut); } catch {}
    const result = await $`${bin} -i ${inputBin} -o ${tmpOut} -a ${archFlag} -c ${String(enc)}`
      .nothrow()
      .quiet();
    const stdout = result.stdout.toString().trim();
    if (stdout) sendToStream({ type: "output", text: stdout + "\n", level: "info" });
    if (result.exitCode !== 0) {
      const stderr = result.stderr.toString().trim();
      sendToStream({ type: "output", text: `SGN failed (exit ${result.exitCode})${stderr ? `: ${stderr}` : ""}\n`, level: "error" });
      try { fs.unlinkSync(tmpOut); } catch {}
      return false;
    }
    if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) {
      sendToStream({ type: "output", text: "SGN produced no output\n", level: "error" });
      try { fs.unlinkSync(tmpOut); } catch {}
      return false;
    }
    fs.renameSync(tmpOut, outputBin);
    return true;
  } catch (err: any) {
    sendToStream({ type: "output", text: `SGN error: ${err?.message ?? err}\n`, level: "error" });
    try { fs.unlinkSync(tmpOut); } catch {}
    return false;
  }
}
