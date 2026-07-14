import logger from "../logger";
import type { BuildTokenPayload } from "../types";
import {
  getBuildSigningSecrets,
  setBuildSigningSecrets,
  getBuildBanlist,
  setBuildBanlist,
} from "../config";

let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKey: CryptoKey | null = null;
let cachedPublicKeyB64: string | null = null;

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function generateKeypair(): Promise<{ privateKeyB64: string; publicKeyB64: string }> {
  const kp = (await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"])) as CryptoKeyPair;
  const privRaw = await crypto.subtle.exportKey("pkcs8", kp.privateKey);
  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
  return {
    privateKeyB64: Buffer.from(privRaw).toString("base64"),
    publicKeyB64: Buffer.from(pubRaw).toString("base64"),
  };
}

async function importKeys(privateKeyB64: string, publicKeyB64: string) {
  const privBytes = Buffer.from(privateKeyB64, "base64");
  const pubBytes = Buffer.from(publicKeyB64, "base64");
  cachedPrivateKey = await crypto.subtle.importKey(
    "pkcs8",
    privBytes,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  cachedPublicKey = await crypto.subtle.importKey(
    "raw",
    pubBytes,
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  cachedPublicKeyB64 = publicKeyB64;
}

async function ensureKeysLoaded(): Promise<void> {
  if (cachedPrivateKey && cachedPublicKey) return;

  let secrets = getBuildSigningSecrets();
  if (!secrets || !secrets.privateKey || !secrets.publicKey) {
    const generated = await generateKeypair();
    secrets = { privateKey: generated.privateKeyB64, publicKey: generated.publicKeyB64 };
    setBuildSigningSecrets(secrets);
    logger.info("[build-signing] generated new Ed25519 build-signing keypair");
  }

  await importKeys(secrets.privateKey, secrets.publicKey);
}

export function resetBuildSigningCacheForTests(): void {
  cachedPrivateKey = null;
  cachedPublicKey = null;
  cachedPublicKeyB64 = null;
}

export async function getBuildSigningPublicKey(): Promise<string> {
  await ensureKeysLoaded();
  return cachedPublicKeyB64 || "";
}

export async function signBuildToken(payload: BuildTokenPayload): Promise<string> {
  await ensureKeysLoaded();
  const payloadJson = JSON.stringify(payload);
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64 = toBase64Url(payloadBytes);
  const sigBuf = await crypto.subtle.sign("Ed25519", cachedPrivateKey!, payloadBytes as any);
  const sigB64 = toBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64}.${sigB64}`;
}

export async function verifyBuildToken(token: string): Promise<BuildTokenPayload | null> {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;

  try {
    await ensureKeysLoaded();
  } catch (err) {
    logger.warn("[build-signing] failed to load signing keys", err);
    return null;
  }

  try {
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const payloadBytes = fromBase64Url(payloadB64);
    const sigBytes = fromBase64Url(sigB64);
    if (sigBytes.length !== 64) return null;

    const ok = await crypto.subtle.verify(
      "Ed25519",
      cachedPublicKey!,
      sigBytes as any,
      payloadBytes as any,
    );
    if (!ok) return null;

    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.v !== 1 ||
      typeof parsed.bid !== "string" ||
      !parsed.bid ||
      typeof parsed.iat !== "number" ||
      (parsed.uid !== null && typeof parsed.uid !== "number")
    ) {
      return null;
    }
    return { v: 1, bid: parsed.bid, uid: parsed.uid ?? null, iat: parsed.iat };
  } catch {
    return null;
  }
}

export function isBuildBanned(buildId: string): boolean {
  if (!buildId) return false;
  return getBuildBanlist().includes(buildId);
}

export function addBuildToBanlist(buildId: string): void {
  if (!buildId) return;
  const list = getBuildBanlist();
  if (list.includes(buildId)) return;
  setBuildBanlist([...list, buildId]);
}

export function removeBuildFromBanlist(buildId: string): void {
  if (!buildId) return;
  const list = getBuildBanlist();
  const next = list.filter((id) => id !== buildId);
  if (next.length !== list.length) setBuildBanlist(next);
}
