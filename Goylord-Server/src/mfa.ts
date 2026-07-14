import { createHmac, timingSafeEqual } from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const DEFAULT_PERIOD_SECONDS = 30;
const DEFAULT_DIGITS = 6;
const DEFAULT_WINDOW = 1;

export function generateMfaSecret(length = 20): string {
  const bytes = new Uint8Array(Math.max(10, Math.min(64, length)));
  crypto.getRandomValues(bytes);
  return base32Encode(Buffer.from(bytes));
}

export function buildTotpUri(params: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const issuer = params.issuer || "Goylord";
  const label = `${issuer}:${params.accountName}`;
  const search = new URLSearchParams({
    secret: params.secret,
    issuer,
    algorithm: "SHA1",
    digits: String(DEFAULT_DIGITS),
    period: String(DEFAULT_PERIOD_SECONDS),
  });
  return `otpauth://totp/${encodeURIComponent(label)}?${search.toString()}`;
}

export function generateTotpCode(
  secret: string,
  timestamp = Date.now(),
  digits = DEFAULT_DIGITS,
  periodSeconds = DEFAULT_PERIOD_SECONDS,
): string {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / periodSeconds);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter), 0);

  const digest = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

export function verifyTotpCode(
  secret: string,
  code: string,
  timestamp = Date.now(),
  window = DEFAULT_WINDOW,
): boolean {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;

  for (let offset = -window; offset <= window; offset++) {
    const candidate = generateTotpCode(
      secret,
      timestamp + offset * DEFAULT_PERIOD_SECONDS * 1000,
    );
    if (safeEqual(candidate, normalized)) return true;
  }

  return false;
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid MFA secret");
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
