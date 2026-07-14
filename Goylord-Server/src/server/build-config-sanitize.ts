const HTML_META_CHARS = /[<>"'`=&]/g;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export function sanitizeInitialClientTag(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const cleaned = value
    .replace(CONTROL_CHARS, " ")
    .replace(HTML_META_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);

  return cleaned || undefined;
}
