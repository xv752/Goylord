import { SECURITY_HEADERS } from "./http-security";

export function secureHeaders(contentType?: string) {
  return {
    ...SECURITY_HEADERS,
    ...(contentType ? { "Content-Type": contentType } : {}),
  };
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
};

export function mimeType(filePath: string) {
  const dot = filePath.lastIndexOf(".");
  if (dot !== -1) return MIME_TYPES[filePath.slice(dot).toLowerCase()] ?? "application/octet-stream";
  return "application/octet-stream";
}
