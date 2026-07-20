import { vi } from "vitest";

vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    downloadBlob: vi.fn().mockResolvedValue(new Blob()),
    upload: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock("@/api/client", () => ({
  authApi: {
    login: vi.fn().mockResolvedValue({ ok: true }),
    logout: vi.fn().mockResolvedValue({}),
    me: vi.fn().mockResolvedValue({ username: "admin", role: "admin", userId: 1, canBuild: true }),
    changePassword: vi.fn().mockResolvedValue({}),
  },
  clientApi: {
    list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, online: 0 }),
    get: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    hardwareOptions: vi.fn().mockResolvedValue({ cpu: [], gpu: [] }),
    countries: vi.fn().mockResolvedValue([]),
    command: vi.fn().mockResolvedValue({}),
    bulk: vi.fn().mockResolvedValue({}),
    bulkGroup: vi.fn().mockResolvedValue({}),
  },
  groupApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  userApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    toggleBuild: vi.fn().mockResolvedValue({}),
    toggleUpload: vi.fn().mockResolvedValue({}),
    getClientAccess: vi.fn().mockResolvedValue([]),
    updateClientAccess: vi.fn().mockResolvedValue({}),
  },
  buildApi: {
    start: vi.fn().mockResolvedValue({ buildId: "test-build-1" }),
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    plugins: vi.fn().mockResolvedValue([]),
  },
  enrollmentApi: {
    stats: vi.fn().mockResolvedValue({ pending: 0, total: 0, approved: 0, denied: 0 }),
    list: vi.fn().mockResolvedValue([]),
    approve: vi.fn().mockResolvedValue({}),
    deny: vi.fn().mockResolvedValue({}),
    approveAll: vi.fn().mockResolvedValue({}),
    config: vi.fn().mockResolvedValue({}),
  },
  scriptApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  autoScriptApi: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  deployApi: {
    upload: vi.fn().mockResolvedValue({}),
    run: vi.fn().mockResolvedValue({}),
    uploads: vi.fn().mockResolvedValue([]),
  },
  pluginApi: {
    list: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue({}),
    uninstall: vi.fn().mockResolvedValue({}),
    enable: vi.fn().mockResolvedValue({}),
    disable: vi.fn().mockResolvedValue({}),
  },
  settingsApi: {
    get: vi.fn().mockResolvedValue({}),
    security: vi.fn().mockResolvedValue({}),
    tls: vi.fn().mockResolvedValue({}),
    oidc: vi.fn().mockResolvedValue({}),
    appearance: vi.fn().mockResolvedValue({}),
    chatConfig: vi.fn().mockResolvedValue({}),
  },
  notificationApi: {
    config: vi.fn().mockResolvedValue({}),
    updateConfig: vi.fn().mockResolvedValue({}),
  },
  logApi: {
    list: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
  },
  socks5Api: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
    stop: vi.fn().mockResolvedValue({}),
  },
  screenshotApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  backupApi: {
    export: vi.fn().mockResolvedValue({}),
    import: vi.fn().mockResolvedValue({}),
  },
  chatApi: {
    history: vi.fn().mockResolvedValue([]),
  },
}));
