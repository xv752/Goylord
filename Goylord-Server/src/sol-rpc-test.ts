const BASE58_VALUE = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;

export type SolRpcTestResult = {
  ok: boolean;
  latencyMs: number;
  slot?: number;
  blockhash?: string;
  lastValidBlockHeight?: number;
  error?: string;
};

type RpcFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function testSolRpcEndpoint(
  endpoint: string,
  timeoutMs = 10_000,
  fetchImpl: RpcFetch = fetch,
): Promise<SolRpcTestResult> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getLatestBlockhash",
        params: [{ commitment: "confirmed" }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new Error("Response was not valid JSON");
    }

    if (data?.error) {
      const detail = typeof data.error.message === "string" ? data.error.message : "RPC returned an error";
      throw new Error(detail);
    }

    const slot = data?.result?.context?.slot;
    const blockhash = data?.result?.value?.blockhash;
    const lastValidBlockHeight = data?.result?.value?.lastValidBlockHeight;
    if (!Number.isSafeInteger(slot) || slot < 0) throw new Error("Response contained an invalid slot");
    if (typeof blockhash !== "string" || !BASE58_VALUE.test(blockhash)) {
      throw new Error("Response contained an invalid blockhash");
    }
    if (!Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight < 0) {
      throw new Error("Response contained an invalid last valid block height");
    }

    return {
      ok: true,
      latencyMs: Math.round(performance.now() - startedAt),
      slot,
      blockhash,
      lastValidBlockHeight,
    };
  } catch (error: any) {
    const timedOut = controller.signal.aborted;
    return {
      ok: false,
      latencyMs: Math.round(performance.now() - startedAt),
      error: timedOut ? `Timed out after ${timeoutMs}ms` : (error?.message || "RPC request failed"),
    };
  } finally {
    clearTimeout(timeout);
  }
}
