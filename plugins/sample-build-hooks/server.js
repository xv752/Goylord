import fs from "fs";
import path from "path";

function record(ctx, hook, data = {}) {
  ctx.db
    .prepare("INSERT INTO build_hook_events(hook, data, created_at) VALUES (?, ?, ?)")
    .run(hook, JSON.stringify(data), Date.now());
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildSettings(ctx, payload) {
  const record = payload.config?.buildPlugins?.[ctx.pluginId];
  return {
    enabled: record?.enabled !== false,
    replaceOutput: record?.settings?.replaceOutput !== false,
    note: String(record?.settings?.note || "test"),
  };
}

export default {
  setup(ctx) {
    ctx.db.exec(`
      CREATE TABLE IF NOT EXISTS build_hook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hook TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS build_hook_events_recent ON build_hook_events(created_at DESC);
    `);
    ctx.log.info("sample build hook plugin ready");
  },

  onBuildPrepare(ctx, payload) {
    const settings = buildSettings(ctx, payload);
    if (!settings.enabled) return null;
    record(ctx, "prepare", {
      buildId: payload.buildId,
      platforms: payload.config?.platforms || [],
      settings,
    });
    return {
      message: "prepare hook observed build config",
    };
  },

  onBuildTarget(ctx, payload) {
    const settings = buildSettings(ctx, payload);
    if (!settings.enabled) return null;
    record(ctx, "target", {
      buildId: payload.buildId,
      platform: payload.platform,
      outputName: payload.outputName,
      settings,
    });

    return { message: `target hook observed ${payload.platform}` };
  },

  buildHooks: {
    post_build(ctx, payload) {
      if (!buildSettings(ctx, payload).enabled) return null;
      record(ctx, "post_build", {
        buildId: payload.buildId,
        platform: payload.platform,
        filename: payload.file?.filename,
        size: payload.file?.size,
      });
    },

    before_donut(ctx, payload) {
      if (!buildSettings(ctx, payload).enabled) return null;
      record(ctx, "before_donut", {
        buildId: payload.buildId,
        platform: payload.platform,
        input: payload.file?.filename,
        output: payload.outputFilename,
        donutArch: payload.donutArch,
      });
      return { message: `before Donut: ${payload.file?.filename}` };
    },

    after_donut(ctx, payload) {
      if (!buildSettings(ctx, payload).enabled) return null;
      record(ctx, "after_donut", {
        buildId: payload.buildId,
        platform: payload.platform,
        filename: payload.file?.filename,
        size: payload.file?.size,
        donutArch: payload.donutArch,
      });
      return { message: `after Donut: ${payload.file?.filename}` };
    },

    before_sgn(ctx, payload) {
      if (!buildSettings(ctx, payload).enabled) return null;
      record(ctx, "before_sgn", {
        buildId: payload.buildId,
        platform: payload.platform,
        input: payload.file?.filename,
        output: payload.outputFilename,
        iterations: payload.iterations,
      });
      return { message: `before SGN: ${payload.file?.filename}` };
    },

    after_sgn(ctx, payload) {
      if (!buildSettings(ctx, payload).enabled) return null;
      record(ctx, "after_sgn", {
        buildId: payload.buildId,
        platform: payload.platform,
        filename: payload.file?.filename,
        size: payload.file?.size,
        iterations: payload.iterations,
      });
      return { message: `after SGN: ${payload.file?.filename}` };
    },
  },

  onBuildArtifact(ctx, payload) {
    const settings = buildSettings(ctx, payload);
    if (!settings.enabled) return null;
    record(ctx, "artifact", {
      buildId: payload.buildId,
      platform: payload.platform,
      filename: payload.file?.filename,
      size: payload.file?.size,
      settings,
    });

    if (!settings.replaceOutput) {
      return { message: "test TXT replacement disabled by plugin setting" };
    }

    const txtName = `${path.parse(payload.file.filename).name}.txt`;
    const txtPath = path.join(payload.outDir, txtName);
    fs.writeFileSync(txtPath, `${settings.note}\n`, "utf8");

    return {
      file: { filename: txtName },
      message: `replaced build output with ${txtName}`,
    };
  },

  onBuildComplete(ctx, payload) {
    if (!buildSettings(ctx, payload).enabled) return null;
    record(ctx, "complete", {
      buildId: payload.buildId,
      files: payload.files?.map((file) => file.filename) || [],
    });
    ctx.broadcast("build_complete", { buildId: payload.buildId, files: payload.files?.length || 0 });
  },

  onBuildFailed(ctx, payload) {
    if (!buildSettings(ctx, payload).enabled) return null;
    record(ctx, "failed", {
      buildId: payload.buildId,
      error: payload.error,
    });
    ctx.broadcast("build_failed", { buildId: payload.buildId, error: payload.error });
  },

  rpc: {
    recent(ctx) {
      const rows = ctx.db
        .prepare("SELECT hook, data, created_at FROM build_hook_events ORDER BY created_at DESC LIMIT 25")
        .all();
      return rows.map((row) => ({
        hook: row.hook,
        createdAt: new Date(row.created_at).toISOString(),
        data: JSON.parse(row.data),
      }));
    },

    clear(ctx, _params, { caller }) {
      if (caller.role !== "admin") throw new Error("Admin only");
      ctx.db.exec("DELETE FROM build_hook_events");
      ctx.broadcast("cleared", { by: caller.id });
      return { ok: true };
    },
  },
};
