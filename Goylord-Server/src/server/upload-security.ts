import path from "path";

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeUploadFilename(
  name: string | undefined | null,
  fallback = "upload.bin",
  maxLength = 128,
): string {
  const fallbackName = fallback || "upload.bin";
  const raw = String(name || "").replace(/\\/g, "/").split("/").pop() || fallbackName;
  const cleaned = raw
    .trim()
    .replace(/[^\w.\-() ]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, maxLength);

  if (!cleaned || cleaned === "." || cleaned === ".." || /^[. ]+$/.test(cleaned)) {
    return fallbackName;
  }

  const stem = cleaned.replace(/\.+$/, "").split(".")[0] || cleaned;
  if (WINDOWS_RESERVED_NAMES.test(stem)) {
    return `_${cleaned}`;
  }

  return cleaned;
}

export function resolveContainedPath(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...segments);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Resolved path escapes target root");
  }
  return resolvedPath;
}
