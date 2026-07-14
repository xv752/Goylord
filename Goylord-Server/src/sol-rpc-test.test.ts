import { describe, expect, test } from "bun:test";
import { testSolRpcEndpoint } from "./sol-rpc-test";

const validBlockhash = "11111111111111111111111111111111";

describe("testSolRpcEndpoint", () => {
  test("accepts a valid latest blockhash response", async () => {
    const fetchImpl = async () => Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: {
        context: { slot: 123456 },
        value: { blockhash: validBlockhash, lastValidBlockHeight: 123600 },
      },
    });

    const result = await testSolRpcEndpoint("https://rpc.example.com", 100, fetchImpl);
    expect(result).toMatchObject({
      ok: true,
      slot: 123456,
      blockhash: validBlockhash,
      lastValidBlockHeight: 123600,
    });
  });

  test("rejects successful HTTP responses with invalid RPC values", async () => {
    const fetchImpl = async () => Response.json({
      jsonrpc: "2.0",
      id: 1,
      result: { context: { slot: "not-a-number" }, value: {} },
    });

    const result = await testSolRpcEndpoint("https://rpc.example.com", 100, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Response contained an invalid slot");
  });

  test("reports HTTP and JSON-RPC errors", async () => {
    const httpResult = await testSolRpcEndpoint(
      "https://rpc.example.com",
      100,
      async () => new Response("unavailable", { status: 503 }),
    );
    expect(httpResult).toMatchObject({ ok: false, error: "HTTP 503" });

    const rpcResult = await testSolRpcEndpoint(
      "https://rpc.example.com",
      100,
      async () => Response.json({ error: { message: "rate limited" } }),
    );
    expect(rpcResult).toMatchObject({ ok: false, error: "rate limited" });
  });

  test("aborts endpoints that exceed the timeout", async () => {
    const fetchImpl = (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });

    const result = await testSolRpcEndpoint("https://rpc.example.com", 5, fetchImpl);
    expect(result).toMatchObject({ ok: false, error: "Timed out after 5ms" });
  });
});
