import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export const DEFAULT_FETCH_URL_MAX_BYTES = 250 * 1024 * 1024;

type LookupAddress = { address: string };
type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
}

function ipv4ToBytes(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => Number(p));
  if (bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return null;
  return bytes;
}

function isPrivateIPv4(address: string): boolean {
  const b = ipv4ToBytes(address);
  if (!b) return true;
  const [a, c] = b;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && c >= 64 && c <= 127) ||
    (a === 169 && c === 254) ||
    (a === 172 && c >= 16 && c <= 31) ||
    (a === 192 && c === 168) ||
    (a === 192 && c === 0) ||
    (a === 198 && (c === 18 || c === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(address: string): boolean {
  const host = normalizeHost(address);
  if (host === "::" || host === "::1") return true;
  if (host.startsWith("fe80:")) return true;
  const firstHextet = Number.parseInt(host.split(":")[0] || "0", 16);
  if (Number.isFinite(firstHextet) && (firstHextet & 0xfe00) === 0xfc00) return true;

  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isPrivateIPv4(mapped[1]);

  return false;
}

export function isPrivateOrLocalAddress(address: string): boolean {
  const host = normalizeHost(address);
  const family = isIP(host);
  if (family === 4) return isPrivateIPv4(host);
  if (family === 6) return isPrivateIPv6(host);
  return false;
}

async function defaultLookup(hostname: string): Promise<LookupAddress[]> {
  return await dnsLookup(hostname, { all: true, verbatim: true });
}

export async function validatePublicHttpUrl(
  rawUrl: string,
  lookupFn: LookupFn = defaultLookup,
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  const hostname = normalizeHost(parsed.hostname);
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal")) {
    throw new Error("URLs pointing to private/internal addresses are not allowed");
  }

  const literalFamily = isIP(hostname);
  const addresses = literalFamily ? [{ address: hostname }] : await lookupFn(hostname);
  if (addresses.length === 0 || addresses.some((entry) => isPrivateOrLocalAddress(entry.address))) {
    throw new Error("URLs pointing to private/internal addresses are not allowed");
  }

  return parsed;
}

export function getFetchUrlMaxBytes(): number {
  const parsed = Number(process.env.GOYLORD_DEPLOY_FETCH_MAX_BYTES);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_FETCH_URL_MAX_BYTES;
}

export async function fetchPublicUrlBytes(
  rawUrl: string,
  maxBytes = getFetchUrlMaxBytes(),
  lookupFn: LookupFn = defaultLookup,
): Promise<{ bytes: Uint8Array; finalUrl: URL }> {
  let current = await validatePublicHttpUrl(rawUrl, lookupFn);

  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Remote fetch failed: ${response.status}`);
      if (redirects === 3) throw new Error("Too many redirects");
      current = await validatePublicHttpUrl(new URL(location, current).toString(), lookupFn);
      continue;
    }

    if (!response.ok) {
      throw new Error(`Remote fetch failed: ${response.status}`);
    }

    const length = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(length) && length > maxBytes) {
      throw new Error(`Remote file exceeds ${maxBytes} byte limit`);
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body?.getReader();
    if (!reader) return { bytes: new Uint8Array(), finalUrl: current };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        try { await reader.cancel(); } catch {}
        throw new Error(`Remote file exceeds ${maxBytes} byte limit`);
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, finalUrl: current };
  }

  throw new Error("Too many redirects");
}
