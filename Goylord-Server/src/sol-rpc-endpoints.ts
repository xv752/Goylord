import { createHash } from "crypto";
import { getSharedUiSettings, saveSharedUiSettings } from "./db";

const SETTINGS_SCOPE = "sol-rpc-endpoints";
export const MAX_SOL_RPC_ENDPOINTS = 20;

export const DEFAULT_SOL_RPC_ENDPOINTS = [
  "https://api.mainnet.solana.com/",
  "https://solana-rpc.publicnode.com/",
  "https://solana.api.pocket.network/",
  "https://solana.leorpc.com/?api_key=FREE",
  "https://public.rpc.solanavibestation.com/",
  "https://api.uniblock.dev/uni/v1/json-rpc?chainId=solana",
];

export type SolRpcEndpoint = { id: string; url: string };

export function normalizeSolRpcUrl(value: unknown): string {
  if (typeof value !== "string") throw new Error("RPC endpoint must be a URL string");
  const trimmed = value.trim();
  if (!trimmed) throw new Error("RPC endpoint is required");
  if (trimmed.length > 2048) throw new Error("RPC endpoint is too long");

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid RPC endpoint URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("RPC endpoint must use HTTP or HTTPS");
  }
  if (parsed.username || parsed.password) {
    throw new Error("RPC endpoint must not contain URL credentials");
  }
  return parsed.toString();
}

export function normalizeSolRpcUrls(values: unknown): string[] {
  if (!Array.isArray(values)) throw new Error("endpoints must be an array");
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = normalizeSolRpcUrl(value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  if (result.length > MAX_SOL_RPC_ENDPOINTS) {
    throw new Error(`A maximum of ${MAX_SOL_RPC_ENDPOINTS} RPC endpoints is allowed`);
  }
  return result;
}

function endpointId(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export function getSolRpcEndpointUrls(): string[] {
  const record = getSharedUiSettings(SETTINGS_SCOPE);
  if (!record) return [...DEFAULT_SOL_RPC_ENDPOINTS];
  try {
    const parsed = JSON.parse(record.settingsJson);
    return normalizeSolRpcUrls(parsed?.endpoints);
  } catch {
    return [...DEFAULT_SOL_RPC_ENDPOINTS];
  }
}

export function getSolRpcEndpoints(): SolRpcEndpoint[] {
  return getSolRpcEndpointUrls().map((url) => ({ id: endpointId(url), url }));
}

export function saveSolRpcEndpointUrls(values: unknown, userId: number): SolRpcEndpoint[] {
  const endpoints = normalizeSolRpcUrls(values);
  saveSharedUiSettings(SETTINGS_SCOPE, JSON.stringify({ endpoints }), userId);
  return endpoints.map((url) => ({ id: endpointId(url), url }));
}
