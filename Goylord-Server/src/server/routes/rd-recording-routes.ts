import { authenticateRequest } from "../../auth";
import { requireClientAccess, requireFeatureAccess } from "../../rbac";
import {
  getRemoteDesktopRecordingFile,
  getRemoteDesktopRecordingStatus,
  listRemoteDesktopRecordings,
} from "../rd-recording";

type RdRecordingRouteDeps = {
  secureHeaders: (contentType?: string) => Record<string, string>;
};

function forbiddenResponse(error: unknown): Response {
  if (error instanceof Response) return error;
  return new Response("Forbidden", { status: 403 });
}

async function authorize(req: Request, clientId: string): Promise<Response | null> {
  const user = await authenticateRequest(req);
  if (!user) return new Response("Unauthorized", { status: 401 });
  try {
    requireClientAccess(user, clientId);
    requireFeatureAccess(user, "remote_desktop");
  } catch (error) {
    return forbiddenResponse(error);
  }
  return null;
}

export async function handleRemoteDesktopRecordingRoutes(
  req: Request,
  url: URL,
  deps: RdRecordingRouteDeps,
): Promise<Response | null> {
  const listMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/rd\/recordings$/);
  if (listMatch && req.method === "GET") {
    const clientId = decodeURIComponent(listMatch[1]);
    const denied = await authorize(req, clientId);
    if (denied) return denied;
    return Response.json({
      active: getRemoteDesktopRecordingStatus(clientId),
      items: listRemoteDesktopRecordings(clientId),
    });
  }

  const fileMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/rd\/recordings\/([^/]+)\/([^/]+)$/);
  if (fileMatch && req.method === "GET") {
    const clientId = decodeURIComponent(fileMatch[1]);
    const recordingId = decodeURIComponent(fileMatch[2]);
    const fileName = decodeURIComponent(fileMatch[3]);
    const denied = await authorize(req, clientId);
    if (denied) return denied;

    const file = getRemoteDesktopRecordingFile(clientId, recordingId, fileName);
    if (!file) return new Response("Not found", { status: 404 });
    const contentType = fileName.toLowerCase().endsWith(".mp4") ? "video/mp4" : "video/webm";

    return new Response(Bun.file(file.path), {
      headers: {
        ...deps.secureHeaders(contentType),
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
        "Cache-Control": "no-store, private",
      },
    });
  }

  return null;
}
