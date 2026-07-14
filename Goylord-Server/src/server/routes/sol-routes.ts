import { createHash, randomBytes, createCipheriv } from "crypto";
import { authenticateRequest } from "../../auth";
import { getConfig } from "../../config";
import { logger } from "../../logger";
import { requirePermission } from "../../rbac";
import { consumeSolRpcRateLimit } from "../../rateLimit";
import {
  getSolRpcEndpoints,
  normalizeSolRpcUrl,
  saveSolRpcEndpointUrls,
} from "../../sol-rpc-endpoints";
import { testSolRpcEndpoint } from "../../sol-rpc-test";

let _solana: typeof import("@solana/web3.js") | null = null;
async function getSolana() {
  if (!_solana) {
    _solana = await import("@solana/web3.js");
  }
  return _solana;
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [0];
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    let carry = idx;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const char of str) {
    if (char !== '1') break;
    bytes.push(0);
  }
  return new Uint8Array(bytes.reverse());
}

function encryptServerUrl(serverUrl: string, agentToken: string): string {
  const keyHash = createHash("sha256").update(agentToken).digest();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyHash, nonce);
  const encrypted = Buffer.concat([cipher.update(serverUrl, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, tag]).toString("base64");
}

export async function handleSolRoutes(
  req: Request,
  url: URL,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/api/sol")) {
    return null;
  }

  try {
    const user = await authenticateRequest(req);
    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (req.method === "GET" && url.pathname === "/api/sol/rpc-endpoints") {
      const records = getSolRpcEndpoints();
      return Response.json({ endpoints: records.map((item) => item.url), records });
    }

    try { requirePermission(user, "system:configure"); }
    catch (error) { return error instanceof Response ? error : new Response("Forbidden", { status: 403 }); }

    if (req.method === "POST" && url.pathname === "/api/sol/rpc-endpoints/test") {
      const records = getSolRpcEndpoints();
      const results = await Promise.all(records.map(async (record) => ({
        ...record,
        ...await testSolRpcEndpoint(record.url),
      })));
      return Response.json({
        tested: results.length,
        passed: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
      });
    }

    if (req.method === "POST" && url.pathname === "/api/sol/rpc-endpoints") {
      const body = await req.json();
      const current = getSolRpcEndpoints().map((item) => item.url);
      try {
        const endpoint = normalizeSolRpcUrl(body?.url);
        if (current.includes(endpoint)) {
          return Response.json({ error: "RPC endpoint is already in the list" }, { status: 409 });
        }
        const records = saveSolRpcEndpointUrls([...current, endpoint], user.userId);
        return Response.json({ records, endpoints: records.map((item) => item.url) }, { status: 201 });
      } catch (error: any) {
        return Response.json({ error: error?.message || "Invalid RPC endpoint" }, { status: 400 });
      }
    }

    const endpointMatch = url.pathname.match(/^\/api\/sol\/rpc-endpoints\/([a-f0-9]{16})$/);
    if (endpointMatch && (req.method === "PATCH" || req.method === "DELETE")) {
      const current = getSolRpcEndpoints();
      const index = current.findIndex((item) => item.id === endpointMatch[1]);
      if (index < 0) return Response.json({ error: "RPC endpoint not found" }, { status: 404 });
      const urls = current.map((item) => item.url);
      if (req.method === "DELETE") urls.splice(index, 1);
      else {
        try {
          const endpoint = normalizeSolRpcUrl((await req.json())?.url);
          if (urls.some((item, itemIndex) => itemIndex !== index && item === endpoint)) {
            return Response.json({ error: "RPC endpoint is already in the list" }, { status: 409 });
          }
          urls[index] = endpoint;
        } catch (error: any) {
          return Response.json({ error: error?.message || "Invalid RPC endpoint" }, { status: 400 });
        }
      }
      const records = saveSolRpcEndpointUrls(urls, user.userId);
      return Response.json({ records, endpoints: records.map((item) => item.url) });
    }

    if (req.method === "POST" && url.pathname === "/api/sol/preview") {
      const body = await req.json();
      const { serverUrl } = body;

      if (!serverUrl || typeof serverUrl !== "string" || !serverUrl.trim()) {
        return Response.json({ error: "serverUrl is required" }, { status: 400 });
      }

      const config = getConfig();
      const agentToken = config.auth.agentToken;
      if (!agentToken) {
        return Response.json({ error: "No agent token configured on this server" }, { status: 400 });
      }

      const memo = encryptServerUrl(serverUrl.trim(), agentToken);
      return Response.json({ memo, memoLength: memo.length });
    }

    if (req.method === "POST" && url.pathname === "/api/sol/publish") {
      const rateLimit = consumeSolRpcRateLimit(user.userId, "publish");
      if (rateLimit.limited) return Response.json(
        { error: "Solana publish rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter || 60) } },
      );
      const body = await req.json();
      const { privateKeyBase58, serverUrl, rpcUrl } = body;

      if (!serverUrl || typeof serverUrl !== "string" || !serverUrl.trim()) {
        return Response.json({ error: "serverUrl is required" }, { status: 400 });
      }
      if (!privateKeyBase58 || typeof privateKeyBase58 !== "string" || !privateKeyBase58.trim()) {
        return Response.json({ error: "privateKeyBase58 is required" }, { status: 400 });
      }

      const config = getConfig();
      const agentToken = config.auth.agentToken;
      if (!agentToken) {
        return Response.json({ error: "No agent token configured on this server" }, { status: 400 });
      }

      let keypair: InstanceType<Awaited<ReturnType<typeof getSolana>>["Keypair"]>;
      try {
        const { Keypair: SolKeypair } = await getSolana();
        const decoded = decodeBase58(privateKeyBase58.trim());
        keypair = SolKeypair.fromSecretKey(decoded);
      } catch {
        return Response.json({ error: "Invalid Solana private key (Base58)" }, { status: 400 });
      }

      let endpoint: string;
      try {
        endpoint = normalizeSolRpcUrl(rpcUrl);
      } catch (err: any) {
        return Response.json({ error: err?.message || "Invalid RPC URL" }, { status: 400 });
      }

      const memo = encryptServerUrl(serverUrl.trim(), agentToken);

      try {
        const { Connection, Transaction, TransactionInstruction, PublicKey } = await getSolana();
        const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
        const connection = new Connection(endpoint, "confirmed");

        const memoInstruction = new TransactionInstruction({
          keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
          programId: MEMO_PROGRAM_ID,
          data: Buffer.from(memo, "utf8"),
        });

        const transaction = new Transaction().add(memoInstruction);
        transaction.feePayer = keypair.publicKey;

        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = blockhash;

        transaction.sign(keypair);

        const signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        await connection.confirmTransaction(signature, "confirmed");

        logger.info(`[sol] Published memo to Solana. Signature: ${signature}, Address: ${keypair.publicKey.toBase58()}`);

        return Response.json({
          success: true,
          signature,
          address: keypair.publicKey.toBase58(),
          memo,
          memoLength: memo.length,
          explorerUrl: endpoint.includes("devnet")
            ? `https://explorer.solana.com/tx/${signature}?cluster=devnet`
            : `https://explorer.solana.com/tx/${signature}`,
        });
      } catch (err: any) {
        logger.error(`[sol] Failed to publish memo: ${err?.message || err}`);
        return Response.json({
          error: `Transaction failed: ${err?.message || "Unknown error"}`,
        }, { status: 500 });
      }
    }

    if (req.method === "POST" && url.pathname === "/api/sol/balance") {
      const rateLimit = consumeSolRpcRateLimit(user.userId, "balance");
      if (rateLimit.limited) return Response.json(
        { error: "Solana balance rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter || 60) } },
      );
      const body = await req.json();
      const { publicKeyBase58, rpcUrl } = body;

      if (!publicKeyBase58 || typeof publicKeyBase58 !== "string") {
        return Response.json({ error: "publicKeyBase58 is required" }, { status: 400 });
      }

      let pubkey: InstanceType<Awaited<ReturnType<typeof getSolana>>["PublicKey"]>;
      try {
        const { PublicKey } = await getSolana();
        pubkey = new PublicKey(publicKeyBase58.trim());
      } catch {
        return Response.json({ error: "Invalid Solana public key" }, { status: 400 });
      }

      try {
        const endpoint = normalizeSolRpcUrl(rpcUrl);
        const { Connection, LAMPORTS_PER_SOL } = await getSolana();
        const connection = new Connection(endpoint, "confirmed");
        const balance = await connection.getBalance(pubkey);
        return Response.json({
          balance,
          balanceSol: balance / LAMPORTS_PER_SOL,
        });
      } catch (err: any) {
        return Response.json({
          error: `Failed to fetch balance: ${err?.message || "Unknown error"}`,
        }, { status: 500 });
      }
    }

    return null;
  } catch (err: any) {
    logger.error(`[sol] Route error: ${err?.message || err}`);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
