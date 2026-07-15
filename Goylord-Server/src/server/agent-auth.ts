import { logger } from "../logger";
import { timingSafeEqual } from "crypto";

let warnedDisableAuthIgnored = false;
let loggedAuthDisabledByEnv = false;
let loggedAuthDisabledNoToken = false;

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isAuthorizedAgentRequest(
  req: Request,
  url: URL,
  agentToken?: string,
): boolean {
  const disableAuth =
    String(process.env.GOYLORD_DISABLE_AGENT_AUTH || "").toLowerCase() ===
    "true";
  if (disableAuth) {
    const nodeEnv = String(process.env.NODE_ENV || "development").toLowerCase();
    if (nodeEnv === "production") {
      if (!warnedDisableAuthIgnored) {
        warnedDisableAuthIgnored = true;
        logger.warn("[auth] GOYLORD_DISABLE_AGENT_AUTH is ignored in production mode");
      }
    } else {
      if (!loggedAuthDisabledByEnv) {
        loggedAuthDisabledByEnv = true;
        logger.info("[auth] Agent auth explicitly disabled by GOYLORD_DISABLE_AGENT_AUTH=true (non-production mode)");
      }
      return true;
    }
  }

  const token = agentToken?.trim();
  if (!token) {
    if (!loggedAuthDisabledNoToken) {
      loggedAuthDisabledNoToken = true;
      logger.info("[auth] Agent auth disabled");
    }
    return true;
  }

  const headerToken = req.headers.get("x-agent-token");
  const queryToken = url.searchParams.get("token");
  if (queryToken !== null) {
    url.searchParams.delete("token");
  }
  const isAuthed =
    (headerToken !== null && safeCompare(headerToken, token)) ||
    (queryToken !== null && safeCompare(queryToken, token));

  return isAuthed;
}
