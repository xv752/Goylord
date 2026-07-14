import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ensureDataDir } from "../paths";
import { logger } from "../logger";
import * as sessionManager from "../sessions/sessionManager";
import { safeSendViewer } from "./ws-viewer-utils";

export type RdRecordingStatus =
  | "starting"
  | "recording"
  | "stopping"
  | "stopped"
  | "failed";

export type RdRecordingSummary = {
  id: string;
  clientId: string;
  status: RdRecordingStatus;
  startedAt: number;
  stoppedAt?: number;
  requestedByUserId?: number;
  requestedByUsername?: string;
  sourceFps?: number;
  targetFps: number;
  segmentSeconds: number;
  compact: boolean;
  encodingMode: "copy" | "compact" | "transcode";
  framesWritten: number;
  framesDropped: number;
  framesSkipped: number;
  bytesWritten: number;
  error?: string;
  files: Array<{
    name: string;
    size: number;
    downloadUrl: string;
  }>;
};

type ActiveRecording = Omit<RdRecordingSummary, "files"> & {
  dir: string;
  process: ChildProcessWithoutNullStreams;
  inputCodec: "mjpeg" | "h264";
  compact: boolean;
  encodingMode: "copy" | "compact" | "transcode";
  h264Started: boolean;
  lastFrameAt: number;
  lastDebugAt: number;
  stderr: string;
  writeBlocked: boolean;
  finalized: boolean;
};

type StartOptions = {
  clientId: string;
  requestedByUserId?: number;
  requestedByUsername?: string;
  fps?: number;
  sourceFps?: number;
  inputCodec?: string;
  compact?: boolean;
};

const activeRecordings = new Map<string, ActiveRecording>();

function sanitizePathPart(value: string): string {
  return String(value || "client")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96) || "client";
}

function recordingRoot(): string {
  return path.join(ensureDataDir(), "rd-recordings");
}

function clientRecordingDir(clientId: string): string {
  return path.join(recordingRoot(), sanitizePathPart(clientId));
}

function metadataPath(dir: string): string {
  return path.join(dir, "recording.json");
}

function ffmpegPath(): string {
  return process.env.GOYLORD_FFMPEG_PATH?.trim() || "ffmpeg";
}

function envNumber(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function requestedFps(raw?: number): number | undefined {
  if (!raw || !Number.isFinite(raw)) return undefined;
  return Math.max(1, Math.min(120, Math.floor(raw)));
}

function targetFps(raw?: number): number {
  return requestedFps(raw) || envNumber("GOYLORD_RD_RECORD_FPS", 15, 1, 120);
}

function h264InputFps(raw?: number): number {
  const fallback = envNumber("GOYLORD_RD_RECORD_H264_FPS", 60, 1, 120);
  if (!raw || !Number.isFinite(raw)) return fallback;
  return Math.max(1, Math.min(120, Math.floor(raw)));
}

function segmentSeconds(): number {
  return envNumber("GOYLORD_RD_RECORD_SEGMENT_SECONDS", 600, 30, 3600);
}

function videoBitrate(): string {
  return process.env.GOYLORD_RD_RECORD_BITRATE?.trim() || "2500k";
}

function compactCrf(): number {
  return envNumber("GOYLORD_RD_RECORD_COMPACT_CRF", 30, 18, 40);
}

function compactPreset(): string {
  const value = process.env.GOYLORD_RD_RECORD_COMPACT_PRESET?.trim() || "veryfast";
  return /^(ultrafast|superfast|veryfast|faster|fast|medium|slow|slower|veryslow)$/i.test(value)
    ? value.toLowerCase()
    : "veryfast";
}

function recordingInputCodec(raw?: string): "mjpeg" | "h264" {
  return String(raw || "").toLowerCase() === "h264" ? "h264" : "mjpeg";
}

function frameFormatLabel(format: unknown): string {
  if (typeof format === "number") {
    return format === 1 ? "jpeg(1)" :
      format === 2 ? "blocks(2)" :
      format === 3 ? "blocks_raw(3)" :
      format === 4 ? "h264(4)" :
      `unknown(${format})`;
  }
  return String(format || "jpeg").toLowerCase();
}

function h264StreamStartFlags(bytes: Uint8Array): { sps: boolean; pps: boolean; idr: boolean } {
  const flags = { sps: false, pps: false, idr: false };
  for (let i = 0; i + 4 < bytes.length; i++) {
    let startCodeLen = 0;
    if (bytes[i] === 0x00 && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x01) {
      startCodeLen = 3;
    } else if (
      i + 4 < bytes.length &&
      bytes[i] === 0x00 &&
      bytes[i + 1] === 0x00 &&
      bytes[i + 2] === 0x00 &&
      bytes[i + 3] === 0x01
    ) {
      startCodeLen = 4;
    }
    if (!startCodeLen) continue;
    const nalIndex = i + startCodeLen;
    if (nalIndex >= bytes.length) break;
    const nalType = bytes[nalIndex] & 0x1f;
    if (nalType === 5) flags.idr = true;
    if (nalType === 7) flags.sps = true;
    if (nalType === 8) flags.pps = true;
    i = nalIndex;
  }
  return flags;
}

function listSegmentFiles(clientId: string, recordingId: string): RdRecordingSummary["files"] {
	const dir = path.join(clientRecordingDir(clientId), recordingId);
	if (!fs.existsSync(dir)) return [];
	const prefix = `${recordingId}-`;
	return fs
		.readdirSync(dir)
		.filter((name) => name.startsWith(prefix) && (name.endsWith(".mp4") || name.endsWith(".webm")))
		.sort()
		.map((name) => {
			const filePath = path.join(dir, name);
      let size = 0;
      try {
        size = fs.statSync(filePath).size;
      } catch {}
      return {
        name,
        size,
        downloadUrl: `/api/clients/${encodeURIComponent(clientId)}/rd/recordings/${encodeURIComponent(recordingId)}/${encodeURIComponent(name)}`,
      };
    });
}

function toSummary(recording: ActiveRecording): RdRecordingSummary {
  return {
    id: recording.id,
    clientId: recording.clientId,
    status: recording.status,
    startedAt: recording.startedAt,
    stoppedAt: recording.stoppedAt,
    requestedByUserId: recording.requestedByUserId,
    requestedByUsername: recording.requestedByUsername,
    sourceFps: recording.sourceFps,
    targetFps: recording.targetFps,
    segmentSeconds: recording.segmentSeconds,
    compact: recording.compact,
    encodingMode: recording.encodingMode,
    framesWritten: recording.framesWritten,
    framesDropped: recording.framesDropped,
    framesSkipped: recording.framesSkipped,
    bytesWritten: recording.bytesWritten,
    error: recording.error,
    files: listSegmentFiles(recording.clientId, recording.id),
  };
}

function writeMetadata(recording: ActiveRecording): void {
  try {
    fs.writeFileSync(metadataPath(recording.dir), JSON.stringify(toSummary(recording), null, 2));
  } catch (err) {
    logger.warn(`[rd-recording] failed to write metadata for ${recording.clientId}: ${(err as Error).message}`);
  }
}

function broadcastStatus(clientId: string): void {
  const status = getRemoteDesktopRecordingStatus(clientId);
  for (const session of sessionManager.getRdSessionsForClient(clientId)) {
    safeSendViewer(session.viewer, { type: "recording_status", recording: status });
  }
}

function finalizeRecording(recording: ActiveRecording, status: RdRecordingStatus, error?: string): void {
  if (recording.finalized) return;
  recording.finalized = true;
  if (status === "stopped" && recording.framesWritten === 0) {
    status = "failed";
    error = error || "No compatible video frames were received while recording.";
  }
  recording.status = status;
  recording.stoppedAt = Date.now();
  if (error) recording.error = error;
  activeRecordings.delete(recording.clientId);
  writeMetadata(recording);
  logger.info(`[rd-recording] ${status} client=${recording.clientId} id=${recording.id} frames=${recording.framesWritten} dropped=${recording.framesDropped} skipped=${recording.framesSkipped}`);
  broadcastStatus(recording.clientId);
}

export function startRemoteDesktopRecording(options: StartOptions): RdRecordingSummary {
  const existing = activeRecordings.get(options.clientId);
  if (existing) return toSummary(existing);

  const id = crypto.randomUUID();
  const dir = path.join(clientRecordingDir(options.clientId), id);
  fs.mkdirSync(dir, { recursive: true });

  const inputCodec = recordingInputCodec(options.inputCodec);
  const requestedOutputFps = requestedFps(options.fps);
  const sourceFps = inputCodec === "h264" ? h264InputFps(options.sourceFps) : undefined;
  const fps = inputCodec === "h264"
    ? Math.min(requestedOutputFps || sourceFps || h264InputFps(), sourceFps || h264InputFps())
    : targetFps(options.fps);
  const h264FpsLimited = inputCodec === "h264" && !!requestedOutputFps && !!sourceFps && requestedOutputFps < sourceFps;
  const seconds = segmentSeconds();
  const compact = !!options.compact;
  const encodingMode: ActiveRecording["encodingMode"] = compact
    ? "compact"
    : inputCodec === "h264" && !h264FpsLimited
      ? "copy"
      : "transcode";
  const outputFile = path.join(dir, `${id}-001.mp4`);
  const h264InputArgs = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-fflags",
    "+genpts",
    "-r",
    String(sourceFps || fps),
    "-f",
    "h264",
    "-i",
    "pipe:0",
    "-an",
  ];
  const args = inputCodec === "h264"
    ? encodingMode === "copy"
      ? [
        ...h264InputArgs,
        "-c:v",
        "copy",
        "-movflags",
        "+faststart",
        outputFile,
      ]
      : [
        ...h264InputArgs,
        ...(h264FpsLimited ? ["-vf", `fps=${fps}`] : []),
        "-c:v",
        "libx264",
        "-preset",
        compact ? compactPreset() : "veryfast",
        "-tune",
        "zerolatency",
        ...(compact ? ["-crf", String(compactCrf())] : ["-b:v", videoBitrate()]),
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputFile,
      ]
    : [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-f",
        "image2pipe",
        "-framerate",
        String(fps),
        "-vcodec",
        "mjpeg",
        "-i",
        "pipe:0",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        compact ? compactPreset() : "veryfast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        ...(compact ? ["-crf", String(compactCrf())] : ["-b:v", videoBitrate()]),
        "-movflags",
        "+faststart",
        outputFile,
      ];

  const child = spawn(ffmpegPath(), args, { windowsHide: true });
  const recording: ActiveRecording = {
    id,
    clientId: options.clientId,
    status: "starting",
    startedAt: Date.now(),
    requestedByUserId: options.requestedByUserId,
    requestedByUsername: options.requestedByUsername,
    sourceFps,
    targetFps: fps,
    segmentSeconds: seconds,
    framesWritten: 0,
    framesDropped: 0,
    framesSkipped: 0,
    bytesWritten: 0,
    dir,
    process: child,
    inputCodec,
    compact,
    encodingMode,
    h264Started: false,
    lastFrameAt: 0,
    lastDebugAt: 0,
    stderr: "",
    writeBlocked: false,
    finalized: false,
  };

  activeRecordings.set(options.clientId, recording);
  writeMetadata(recording);

  child.stderr.on("data", (chunk) => {
    recording.stderr = `${recording.stderr}${chunk.toString()}`.slice(-4000);
  });
  child.stdin.on("drain", () => {
    recording.writeBlocked = false;
  });
  child.stdin.on("error", (err) => {
    if (!recording.finalized) {
      recording.error = (err as Error).message;
    }
  });
  child.once("error", (err) => {
    finalizeRecording(recording, "failed", `ffmpeg failed to start: ${(err as Error).message}`);
  });
  child.once("exit", (code, signal) => {
    if (recording.finalized) return;
    const ok = recording.status === "stopping" || code === 0;
    const err = ok ? undefined : (recording.stderr || `ffmpeg exited with code=${code} signal=${signal || ""}`).trim();
    logger.debug(`[rd-recording] ffmpeg exit client=${recording.clientId} id=${recording.id} code=${code ?? "null"} signal=${signal || ""} frames=${recording.framesWritten} skipped=${recording.framesSkipped} dropped=${recording.framesDropped}${recording.stderr ? ` stderr=${recording.stderr.slice(-500)}` : ""}`);
    finalizeRecording(recording, ok ? "stopped" : "failed", err);
  });

  const outputCodec = encodingMode === "copy" ? "copy" : "libx264";
  const outputRate = encodingMode === "copy" ? "source" : compact ? `crf${compactCrf()}` : videoBitrate();
  const outputPreset = encodingMode === "copy" ? "source" : compact ? compactPreset() : "veryfast";
  logger.info(`[rd-recording] started client=${options.clientId} id=${id} source_fps=${sourceFps || "n/a"} target_fps=${fps} fps_limited=${h264FpsLimited} segment=${seconds}s input=${inputCodec} output=mp4 mode=${encodingMode} codec=${outputCodec} bitrate=${outputRate} preset=${outputPreset} file=${outputFile}`);
  broadcastStatus(options.clientId);
  return toSummary(recording);
}

export function recordRemoteDesktopFrame(clientId: string, header: any, bytes: Uint8Array): void {
  const recording = activeRecordings.get(clientId);
  if (!recording || recording.status === "stopping") return;

  const rawFormat = header?.format ?? "jpeg";
  const format = typeof rawFormat === "number" ? rawFormat : String(rawFormat).toLowerCase();
  const isH264 = format === 4 || format === "h264";
  const isJpeg = format === 1 || format === "jpeg" || format === "jpg";
  if ((recording.inputCodec === "h264" && !isH264) || (recording.inputCodec === "mjpeg" && !isJpeg)) {
    recording.framesSkipped += 1;
    if (recording.framesSkipped <= 5 || recording.framesSkipped % 60 === 0) {
      logger.debug(`[rd-recording] skip frame client=${clientId} id=${recording.id} reason=unsupported_format expected=${recording.inputCodec} format=${frameFormatLabel(rawFormat)} bytes=${bytes.byteLength} skipped=${recording.framesSkipped} written=${recording.framesWritten}`);
    }
    return;
  }

  if (recording.inputCodec === "h264" && !recording.h264Started) {
    const flags = h264StreamStartFlags(bytes);
    if (!flags.sps || !flags.pps) {
      recording.framesSkipped += 1;
      if (recording.framesSkipped <= 5 || recording.framesSkipped % 60 === 0) {
        logger.debug(`[rd-recording] skip frame client=${clientId} id=${recording.id} reason=waiting_for_h264_headers format=${frameFormatLabel(rawFormat)} bytes=${bytes.byteLength} sps=${flags.sps} pps=${flags.pps} idr=${flags.idr} skipped=${recording.framesSkipped} written=${recording.framesWritten}`);
      }
      return;
    }
    recording.h264Started = true;
    logger.debug(`[rd-recording] h264 stream start client=${clientId} id=${recording.id} bytes=${bytes.byteLength} sps=${flags.sps} pps=${flags.pps} idr=${flags.idr}`);
  }

  const now = Date.now();
  const shouldThrottle = recording.inputCodec !== "h264";
  const minInterval = Math.floor(1000 / Math.max(1, recording.targetFps));
  if (shouldThrottle && recording.lastFrameAt && now - recording.lastFrameAt < minInterval) {
    recording.framesSkipped += 1;
    if (recording.framesSkipped <= 5 || recording.framesSkipped % 120 === 0) {
      logger.debug(`[rd-recording] skip frame client=${clientId} id=${recording.id} reason=fps_throttle format=${frameFormatLabel(rawFormat)} deltaMs=${now - recording.lastFrameAt} minMs=${minInterval} skipped=${recording.framesSkipped} written=${recording.framesWritten}`);
    }
    return;
  }

  if (!recording.process.stdin.writable) {
    recording.framesDropped += 1;
    if (recording.framesDropped <= 5 || recording.framesDropped % 30 === 0) {
      logger.debug(`[rd-recording] drop frame client=${clientId} id=${recording.id} reason=stdin_closed writable=${recording.process.stdin.writable} dropped=${recording.framesDropped} written=${recording.framesWritten}`);
    }
    return;
  }
  if (recording.inputCodec !== "h264" && recording.writeBlocked) {
    recording.framesDropped += 1;
    if (recording.framesDropped <= 5 || recording.framesDropped % 30 === 0) {
      logger.debug(`[rd-recording] drop frame client=${clientId} id=${recording.id} reason=stdin_backpressure writable=${recording.process.stdin.writable} dropped=${recording.framesDropped} written=${recording.framesWritten}`);
    }
    return;
  }

  recording.status = "recording";
  recording.lastFrameAt = now;
  recording.framesWritten += 1;
  recording.bytesWritten += bytes.byteLength;
  recording.writeBlocked = !recording.process.stdin.write(Buffer.from(bytes));
  if (recording.framesWritten === 1 || now - recording.lastDebugAt >= 5000) {
    recording.lastDebugAt = now;
    logger.debug(`[rd-recording] write frame client=${clientId} id=${recording.id} format=${frameFormatLabel(rawFormat)} bytes=${bytes.byteLength} written=${recording.framesWritten} skipped=${recording.framesSkipped} dropped=${recording.framesDropped} stdinBlocked=${recording.writeBlocked}`);
  }
}

export function stopRemoteDesktopRecording(clientId: string, reason = "stopped"): RdRecordingSummary | null {
  const recording = activeRecordings.get(clientId);
  if (!recording) return null;
  logger.debug(`[rd-recording] stop requested client=${clientId} id=${recording.id} reason=${reason} status=${recording.status} frames=${recording.framesWritten} skipped=${recording.framesSkipped} dropped=${recording.framesDropped}`);
  recording.status = "stopping";
  recording.error = reason === "stopped" ? recording.error : reason;
  writeMetadata(recording);
  try {
    recording.process.stdin.end();
  } catch {}
  const killTimer = setTimeout(() => {
    if (!recording.finalized) {
      try {
        recording.process.kill("SIGKILL");
      } catch {}
      finalizeRecording(recording, "failed", recording.error || "ffmpeg did not stop cleanly");
    }
  }, 5000);
  if (typeof (killTimer as any).unref === "function") {
    (killTimer as any).unref();
  }
  broadcastStatus(clientId);
  return toSummary(recording);
}

export function getRemoteDesktopRecordingStatus(clientId: string): RdRecordingSummary | null {
  const active = activeRecordings.get(clientId);
  if (active) return toSummary(active);
  return listRemoteDesktopRecordings(clientId)[0] || null;
}

export function listRemoteDesktopRecordings(clientId: string): RdRecordingSummary[] {
  const active = activeRecordings.get(clientId);
  const root = clientRecordingDir(clientId);
  const summaries: RdRecordingSummary[] = [];
  if (fs.existsSync(root)) {
    for (const id of fs.readdirSync(root)) {
      const meta = path.join(root, id, "recording.json");
      if (!fs.existsSync(meta)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(meta, "utf8")) as RdRecordingSummary;
        if (parsed.clientId !== clientId || parsed.id !== id) continue;
        parsed.files = listSegmentFiles(clientId, id);
        summaries.push(parsed);
      } catch {}
    }
  }
  if (active && !summaries.some((item) => item.id === active.id)) {
    summaries.push(toSummary(active));
  }
  return summaries.sort((a, b) => b.startedAt - a.startedAt);
}

export function getRemoteDesktopRecordingFile(
	clientId: string,
	recordingId: string,
	fileName: string,
): { path: string; size: number } | null {
	if (!/^[0-9a-f-]{36}$/i.test(recordingId)) return null;
	if (!new RegExp(`^${recordingId.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}-\\d+\\.(mp4|webm)$`).test(fileName)) {
		return null;
	}
  const filePath = path.join(clientRecordingDir(clientId), recordingId, fileName);
  const root = path.resolve(clientRecordingDir(clientId), recordingId);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return null;
  return { path: resolved, size: stat.size };
}

export function stopAllRemoteDesktopRecordings(reason = "server_shutdown"): void {
  for (const clientId of Array.from(activeRecordings.keys())) {
    stopRemoteDesktopRecording(clientId, reason);
  }
}
