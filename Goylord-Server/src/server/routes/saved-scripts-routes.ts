import { authenticateRequest } from "../../auth";
import {
  listSavedScriptsForUser,
  saveSavedScript,
  deleteSavedScript,
} from "../../db";
import { ALLOWED_SCRIPT_TYPES } from "../validation-constants";
import { v4 as uuidv4 } from "uuid";

export async function handleSavedScriptsRoutes(
  req: Request,
  url: URL,
): Promise<Response | null> {
  if (req.method === "GET" && url.pathname === "/api/saved-scripts") {
    const user = await authenticateRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    return Response.json({ items: listSavedScriptsForUser(user.userId) });
  }

  if (req.method === "POST" && url.pathname === "/api/saved-scripts") {
    const user = await authenticateRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const name = String(body?.name || "").trim();
    const content = String(body?.content || "");
    const scriptTypeRaw = String(body?.scriptType || "powershell").trim();
    const id = body?.id ? String(body.id) : uuidv4();

    if (!name) {
      return Response.json({ error: "Name is required" }, { status: 400 });
    }
    if (!content.trim()) {
      return Response.json({ error: "Script content is required" }, { status: 400 });
    }

    const scriptType = ALLOWED_SCRIPT_TYPES.has(scriptTypeRaw)
      ? scriptTypeRaw
      : "powershell";

    const item = saveSavedScript(id, user.userId, name, content, scriptType);
    if (!item) {
      return Response.json({ error: "Script id already in use" }, { status: 409 });
    }
    return Response.json({ ok: true, item });
  }

  const savedScriptMatch = url.pathname.match(/^\/api\/saved-scripts\/(.+)$/);
  if (savedScriptMatch && req.method === "DELETE") {
    const user = await authenticateRequest(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const scriptId = decodeURIComponent(savedScriptMatch[1]);
    const deleted = deleteSavedScript(user.userId, scriptId);
    if (!deleted) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  }

  return null;
}
