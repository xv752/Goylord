const _escapeHtmlMap = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const _escapeHtmlRe = /[&<>"']/g;

export function escapeHtml(value) {
  const s = String(value == null ? "" : value);
  return s.replace(_escapeHtmlRe, (ch) => _escapeHtmlMap[ch]);
}

export function formatBytes(bytes, fractionDigits = 2) {
  const value = Number(bytes) || 0;
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(value)) / Math.log(1024)));
  const scaled = value / Math.pow(1024, unitIndex);
  return `${parseFloat(scaled.toFixed(fractionDigits))} ${units[unitIndex]}`;
}

const _dateFormatter = typeof Intl !== "undefined" ? new Intl.DateTimeFormat() : null;

export function formatDate(timestamp, empty = "") {
  const ts = Number(timestamp) || 0;
  if (!ts) return empty;
  if (_dateFormatter) return _dateFormatter.format(new Date(ts));
  return new Date(ts).toLocaleString();
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - Number(timestamp || 0)) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  if (_dateFormatter) return _dateFormatter.format(new Date(timestamp));
  return new Date(timestamp).toLocaleDateString();
}
