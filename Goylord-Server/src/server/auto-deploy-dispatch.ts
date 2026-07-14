import type { ServerWebSocket } from "bun";
import { v4 as uuidv4 } from "uuid";
import { hasAutoDeployRun, getAutoDeploysByTrigger, recordAutoDeployRun } from "../db";
import { logger } from "../logger";
import { metrics } from "../metrics";
import { encodeMessage } from "../protocol";
import type { SocketData } from "../sessions/types";
import type { ClientInfo } from "../types";
import { logAudit, AuditAction } from "../auditLog";
import { normalizeClientOs } from "./deploy-utils";
import { createUploadPull } from "./file-transfer-state";
import { canUserAccessClient, getUserById } from "../users";

const AUTO_DEPLOY_COMMAND_TIMEOUT_MS = 30 * 60 * 1000;
const AUTO_DEPLOY_UPLOAD_TTL_MS = 30 * 60 * 1000;

type PendingCommandResult = { ok: boolean; message?: string };

type PendingCommandReply = {
  timeout: ReturnType<typeof setTimeout>;
  resolve: (value: PendingCommandResult) => void;
  clientId: string;
};

type AutoDeployDispatchDeps = {
  pendingCommandReplies: Map<string, PendingCommandReply>;
};

function autoDeployCanRunOnClient(
  deploy: { id: string; createdByUserId: number | null },
  clientId: string,
): boolean {
  if (deploy.createdByUserId == null) {
    return true;
  }

  const owner = getUserById(deploy.createdByUserId);
  if (!owner) {
    logger.warn(`[auto-deploy] skipping ${deploy.id}: owner user ${deploy.createdByUserId} no longer exists`);
    return false;
  }
  if (owner.role === "admin") {
    return true;
  }

  return canUserAccessClient(owner.id, owner.role, clientId);
}

function getAutoDeployAuditUser(deploy: { createdByUserId: number | null }): string {
  if (deploy.createdByUserId == null) return "system";
  const owner = getUserById(deploy.createdByUserId);
  return owner?.username || `user:${deploy.createdByUserId}`;
}

function waitForAutoDeployCommand(
  deps: AutoDeployDispatchDeps,
  info: ClientInfo,
  commandType: string,
  payload: unknown,
  timeoutMessage: string,
): Promise<PendingCommandResult> {
  const cmdId = uuidv4();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      deps.pendingCommandReplies.delete(cmdId);
      resolve({ ok: false, message: timeoutMessage });
    }, AUTO_DEPLOY_COMMAND_TIMEOUT_MS);

    deps.pendingCommandReplies.set(cmdId, { resolve, timeout, clientId: info.id });

    try {
      info.ws.send(
        encodeMessage({
          type: "command",
          commandType: commandType as any,
          id: cmdId,
          payload,
        }),
      );
    } catch (err) {
      clearTimeout(timeout);
      deps.pendingCommandReplies.delete(cmdId);
      resolve({ ok: false, message: (err as Error)?.message || "send failed" });
    }
  });
}

export function dispatchAutoDeploysForConnection(
  info: ClientInfo,
  ws: ServerWebSocket<SocketData>,
  deps: AutoDeployDispatchDeps,
): void {
  if (info.role !== "client") return;
  if (ws.data?.autoDeploysRan) return;

  const isNewClient = ws.data?.wasKnown === false;
  const onConnect = getAutoDeploysByTrigger("on_connect");
  const onFirst = isNewClient ? getAutoDeploysByTrigger("on_first_connect") : [];
  const onConnectOnce = getAutoDeploysByTrigger("on_connect_once");
  const deploys = [...onConnect, ...onFirst, ...onConnectOnce];

  if (deploys.length === 0) {
    ws.data.autoDeploysRan = true;
    return;
  }

  const clientOs = normalizeClientOs(info.os, info.osFamily);

  for (const deploy of deploys) {
    if (!autoDeployCanRunOnClient(deploy, info.id)) {
      continue;
    }

    if (deploy.osFilter.length > 0) {
      const rawOs = (info.os || "").toLowerCase();
      if (!deploy.osFilter.includes(rawOs)) {
        continue;
      }
    }

    if (deploy.trigger === "on_connect_once") {
      if (hasAutoDeployRun(deploy.id, info.id)) {
        continue;
      }
    }

    // Verify the file still exists
    try {
      const stat = Bun.file(deploy.filePath);
      if (stat.size === 0) {
        logger.warn(`[auto-deploy] file missing for ${deploy.id}: ${deploy.filePath}`);
        continue;
      }
    } catch {
      logger.warn(`[auto-deploy] file inaccessible for ${deploy.id}: ${deploy.filePath}`);
      continue;
    }

    const destDir = clientOs === "windows"
      ? `C:\\Windows\\Temp\\Goylord\\auto-${deploy.id}`
      : `/tmp/goylord/auto-${deploy.id}`;
    const destPath = clientOs === "windows"
      ? `${destDir}\\${deploy.fileName}`
      : `${destDir}/${deploy.fileName}`;

    const pullId = createUploadPull({
      clientId: info.id,
      filePath: deploy.filePath,
      fileName: deploy.fileName,
      size: deploy.fileSize,
      ttlMs: AUTO_DEPLOY_UPLOAD_TTL_MS,
    });
    const pullUrl = `/api/file/upload/pull/${encodeURIComponent(pullId)}`;

    void (async () => {
      const auditUser = getAutoDeployAuditUser(deploy);
      try {
        const uploadResult = await waitForAutoDeployCommand(
          deps,
          info,
          "file_upload_http",
          { path: destPath, url: pullUrl, total: deploy.fileSize },
          "Timed out waiting for auto-deploy upload to finish",
        );
        if (!uploadResult.ok) {
          throw new Error(uploadResult.message || "auto-deploy upload failed");
        }

        if (clientOs !== "windows") {
          const chmodResult = await waitForAutoDeployCommand(
            deps,
            info,
            "file_chmod",
            { path: destPath, mode: "0755" },
            "Timed out waiting for auto-deploy chmod to finish",
          );
          if (!chmodResult.ok) {
            throw new Error(chmodResult.message || "auto-deploy chmod failed");
          }
        }

        const execResult = await waitForAutoDeployCommand(
          deps,
          info,
          "silent_exec",
          { command: destPath, args: deploy.args, hideWindow: deploy.hideWindow },
          "Timed out waiting for auto-deploy execution to start",
        );
        if (!execResult.ok) {
          throw new Error(execResult.message || "auto-deploy execution failed");
        }

        if (deploy.trigger === "on_connect_once") {
          recordAutoDeployRun(deploy.id, info.id);
        }
        metrics.recordCommand("silent_exec");
        logAudit({
          timestamp: Date.now(),
          username: auditUser,
          ip: "server",
          action: AuditAction.SILENT_EXECUTE,
          targetClientId: info.id,
          success: true,
          details: `auto-deploy:${deploy.name} trigger=${deploy.trigger} file=${deploy.fileName}`,
        });
        logger.info(`[auto-deploy] dispatched ${deploy.id} (${deploy.trigger}) to ${info.id}`);
      } catch (err) {
        logger.warn(`[auto-deploy] failed to dispatch ${deploy.id} to ${info.id}`, err);
        logAudit({
          timestamp: Date.now(),
          username: auditUser,
          ip: "server",
          action: AuditAction.SILENT_EXECUTE,
          targetClientId: info.id,
          success: false,
          details: `auto-deploy:${deploy.name} trigger=${deploy.trigger} file=${deploy.fileName}`,
          errorMessage: (err as Error)?.message || "send failed",
        });
      }
    })();
  }

  ws.data.autoDeploysRan = true;
}
