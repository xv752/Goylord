import type { SessionRecord } from "../../db";
import { escapeHtml } from "./html";

type SessionsMessage = {
  text: string;
  type?: "success" | "error";
};

function summarizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown";
  return userAgent.length > 80 ? `${userAgent.slice(0, 77)}...` : userAgent;
}

function renderMessage(message?: SessionsMessage): string {
  if (!message) return "";
  const classes = message.type === "error"
    ? "text-rose-200 border-rose-700 bg-rose-900/30"
    : "text-emerald-200 border-emerald-700 bg-emerald-900/30";
  return `<p class="text-sm rounded-lg px-3 py-2 border ${classes}" role="status">${escapeHtml(message.text)}</p>`;
}

function renderSessionRow(
  session: SessionRecord,
  currentTokenHash: string | null,
  now: number,
): string {
  const current = session.tokenHash === currentTokenHash;
  const expired = session.expiresAt <= now;
  const canRevoke = !session.revoked && !expired;
  const status = session.revoked
    ? '<span class="text-rose-400">Revoked</span>'
    : expired
      ? '<span class="text-slate-500">Expired</span>'
      : '<span class="text-emerald-400">Active</span>';
  const currentBadge = current
    ? ' <span class="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-sky-600/30 text-sky-300 border border-sky-500/30">Current</span>'
    : "";
  const confirmation = current
    ? "This will revoke your current session and log you out. Continue?"
    : "Revoke this session?";

  return `<tr id="session-${escapeHtml(session.id)}">
    <td class="px-3 py-2 font-mono text-xs text-slate-100">${escapeHtml(session.ip || "—")}</td>
    <td class="px-3 py-2 text-slate-300 text-xs max-w-[200px] truncate" title="${escapeHtml(session.userAgent || "")}">${escapeHtml(summarizeUserAgent(session.userAgent))}</td>
    <td class="px-3 py-2 text-slate-400 text-xs"><time data-sessions-target="time" data-timestamp="${session.createdAt}" datetime="${new Date(session.createdAt * 1000).toISOString()}">—</time></td>
    <td class="px-3 py-2 text-slate-400 text-xs"><time data-sessions-target="time" data-format="relative" data-timestamp="${session.lastActivity}" datetime="${new Date(session.lastActivity * 1000).toISOString()}">—</time></td>
    <td class="px-3 py-2 text-xs">${status}${currentBadge}</td>
    <td class="px-3 py-2 text-right">
      ${canRevoke ? `<form method="post" action="/ui/settings/sessions/${encodeURIComponent(session.id)}/revoke" data-turbo="true" data-controller="confirm" data-action="submit->confirm#confirm" data-confirm-message-value="${escapeHtml(confirmation)}" class="inline">
        <button type="submit" class="px-2.5 py-1.5 rounded bg-red-700/80 hover:bg-red-600 text-white text-xs disabled:opacity-50">
          <i class="fa-solid fa-right-from-bracket mr-1"></i>Revoke
        </button>
      </form>` : ""}
    </td>
  </tr>`;
}

export function renderSessionsFrame(
  sessions: SessionRecord[],
  currentTokenHash: string | null,
  message?: SessionsMessage,
): string {
  const now = Math.floor(Date.now() / 1000);
  const rows = sessions.length > 0
    ? sessions.map((session) => renderSessionRow(session, currentTokenHash, now)).join("")
    : '<tr><td colspan="6" class="px-3 py-6 text-center text-slate-400">No sessions found</td></tr>';

  return `<turbo-frame id="section-sessions" class="block bg-slate-900/60 border border-slate-800 rounded-xl p-5 space-y-4 settings-section" data-controller="sessions">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
          <i class="fa-solid fa-desktop text-emerald-400"></i>
        </div>
        <div>
          <h2 class="text-lg font-semibold">Active Sessions</h2>
          <p class="text-sm text-slate-400">View and manage your active login sessions.</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <a href="/ui/settings/sessions" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm transition-colors">
          <i class="fa-solid fa-rotate"></i>Refresh
        </a>
        <form method="post" action="/ui/settings/sessions/inactive" data-turbo="true" data-controller="confirm" data-action="submit->confirm#confirm" data-confirm-message-value="Remove all expired and revoked sessions?">
          <button type="submit" class="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/40 hover:bg-red-800/60 text-red-100 border border-red-700/60 text-sm transition-colors disabled:opacity-50">
            <i class="fa-solid fa-broom"></i>Remove Inactive
          </button>
        </form>
      </div>
    </div>

    <div class="overflow-x-auto border border-slate-800 rounded-lg">
      <table class="w-full text-sm">
        <thead class="bg-slate-800/60 text-slate-300">
          <tr>
            <th class="text-left px-3 py-2">IP</th>
            <th class="text-left px-3 py-2">Browser / Client</th>
            <th class="text-left px-3 py-2">Created</th>
            <th class="text-left px-3 py-2">Last Active</th>
            <th class="text-left px-3 py-2">Status</th>
            <th class="text-right px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800">${rows}</tbody>
      </table>
    </div>
    ${renderMessage(message)}
  </turbo-frame>`;
}
