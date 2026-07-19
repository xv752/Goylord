import type {
  User, LoginPayload, LoginResponse, Client, PaginatedClients,
  HardwareOptions, Group, BuildProfile, Build, SavedScript,
  Notification, LogEntry, Plugin, Socks5Proxy, EnrollmentAgent,
  ScreenshotEntry, UserClientAccessRule,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers as Record<string, string> },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const authApi = {
  login: (data: LoginPayload) => request<LoginResponse>("/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request("/logout", { method: "POST" }),
  me: () => request<Record<string, unknown>>("/auth/me"),
  changePassword: (id: number, data: { currentPassword: string; newPassword: string }) =>
    request(`/users/${id}/password`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const clientApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<PaginatedClients>(`/clients${qs ? "?" + qs : ""}`);
  },
  get: (id: string) => request<Client>(`/clients/${id}`),
  update: (id: string, data: Partial<Client>) => request<Client>(`/clients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/clients/${id}`, { method: "DELETE" }),
  hardwareOptions: () => request<HardwareOptions>("/clients/hardware-options"),
  countries: () => request<string[]>("/clients/countries"),
  command: (id: string, command: string, payload?: Record<string, unknown>) =>
    request(`/clients/${id}/command`, { method: "POST", body: JSON.stringify({ command, ...payload }) }),
  bulk: (action: string, clientIds: string[], extra?: Record<string, unknown>) =>
    request("/clients/bulk", { method: "POST", body: JSON.stringify({ action, clientIds, ...extra }) }),
  bulkGroup: (clientIds: string[], groupId: string) =>
    request("/clients/bulk-group", { method: "POST", body: JSON.stringify({ clientIds, groupId }) }),
  graph: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : "";
    return request("/clients/graph" + (qs ? "?" + qs : ""));
  },
};

export const groupApi = {
  list: () => request<{ groups: Group[] }>("/groups").then(r => r.groups || []),
  create: (data: { name: string; color?: string }) => request<Group>("/groups", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Group>) => request(`/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/groups/${id}`, { method: "DELETE" }),
};

export const userApi = {
  list: () => request<User[]>("/users"),
  create: (data: { username: string; password: string; role: string }) => request<User>("/users", { method: "POST", body: JSON.stringify(data) }),
  update: (id: number, data: Partial<User>) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: number) => request(`/users/${id}`, { method: "DELETE" }),
  toggleBuild: (id: number) => request(`/users/${id}/can-build`, { method: "PATCH" }),
  toggleUpload: (id: number) => request(`/users/${id}/can-upload-files`, { method: "PATCH" }),
  getClientAccess: (id: number) => request<UserClientAccessRule[]>(`/users/${id}/client-access`),
  updateClientAccess: (id: number, data: { scope: string; rules?: UserClientAccessRule[] }) =>
    request(`/users/${id}/client-access`, { method: "PATCH", body: JSON.stringify(data) }),
};

export const buildApi = {
  start: (data: Record<string, unknown>) => request("/build/start", { method: "POST", body: JSON.stringify(data) }),
  list: () => request<Build[]>("/builds"),
  get: (id: string) => request<Build>(`/builds/${id}`),
  delete: (id: string) => request(`/builds/${id}`, { method: "DELETE" }),
  plugins: () => request<Plugin[]>("/build/plugins"),
};

export const enrollmentApi = {
  stats: () => request<{ pending: number; total: number; approved: number; denied: number }>("/enrollment/stats"),
  list: () => request<EnrollmentAgent[]>("/enrollment/list"),
  approve: (id: string) => request(`/enrollment/${id}/approve`, { method: "POST" }),
  deny: (id: string) => request(`/enrollment/${id}/deny`, { method: "POST" }),
  approveAll: () => request("/enrollment/approve-all", { method: "POST" }),
  config: (data: Record<string, unknown>) => request("/enrollment/config", { method: "PATCH", body: JSON.stringify(data) }),
};

export const scriptApi = {
  list: () => request<SavedScript[]>("/saved-scripts"),
  create: (data: { name: string; content: string }) => request<SavedScript>("/saved-scripts", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: number) => request(`/saved-scripts/${id}`, { method: "DELETE" }),
};

export const autoScriptApi = {
  list: () => request("/auto-scripts"),
  create: (data: Record<string, unknown>) => request("/auto-scripts", { method: "POST", body: JSON.stringify(data) }),
  delete: (id: string) => request(`/auto-scripts/${id}`, { method: "DELETE" }),
};

export const deployApi = {
  upload: (formData: FormData) => fetch(`${BASE}/deploy/upload`, { method: "POST", body: formData, credentials: "include" }).then(r => r.json()),
  run: (clientId: string, data?: Record<string, unknown>) => request(`/deploy/${clientId}/run`, { method: "POST", body: JSON.stringify(data || {}) }),
  uploads: () => request("/deploy/uploads"),
};

export const pluginApi = {
  list: () => request<Plugin[]>("/plugins"),
  upload: (formData: FormData) => fetch(`${BASE}/plugins/upload`, { method: "POST", body: formData, credentials: "include" }).then(r => r.json()),
  uninstall: (id: string) => request(`/plugins/${id}`, { method: "DELETE" }),
  enable: (id: string) => request(`/plugins/${id}/enable`, { method: "POST" }),
  disable: (id: string) => request(`/plugins/${id}/disable`, { method: "POST" }),
};

export const settingsApi = {
  get: () => request<Record<string, unknown>>("/settings"),
  security: (data: Record<string, unknown>) => request("/security", { method: "PATCH", body: JSON.stringify(data) }),
  tls: (data: Record<string, unknown>) => request("/tls", { method: "PATCH", body: JSON.stringify(data) }),
  oidc: (data: Record<string, unknown>) => request("/oidc", { method: "PATCH", body: JSON.stringify(data) }),
  appearance: (data: Record<string, unknown>) => request("/appearance", { method: "PATCH", body: JSON.stringify(data) }),
  chatConfig: (data: Record<string, unknown>) => request("/chat-config", { method: "PATCH", body: JSON.stringify(data) }),
};

export const notificationApi = {
  config: () => request<Record<string, unknown>>("/notifications/config"),
  updateConfig: (data: Record<string, unknown>) => request("/notifications/config", { method: "PATCH", body: JSON.stringify(data) }),
};

export const logApi = {
  list: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ logs: LogEntry[]; total: number }>(`/audit-logs${qs ? "?" + qs : ""}`);
  },
};

export const socks5Api = {
  list: () => request<Socks5Proxy[]>("/socks5/proxies"),
  create: (data: { clientId: string; port?: number }) => request<Socks5Proxy>("/socks5/proxies", { method: "POST", body: JSON.stringify(data) }),
  stop: (id: string) => request(`/socks5/proxies/${id}/stop`, { method: "POST" }),
};

export const screenshotApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(params).toString() : "";
    return request<ScreenshotEntry[]>(`/screenshots${qs ? "?" + qs : ""}`);
  },
};

export const backupApi = {
  export: () => fetch(`${BASE}/backup/export`, { method: "POST", credentials: "include" }),
  import: (body: Blob) => fetch(`${BASE}/backup/import`, { method: "POST", body, credentials: "include" }).then(r => r.json()),
};

export const chatApi = {
  history: () => request("/chat/history"),
};
