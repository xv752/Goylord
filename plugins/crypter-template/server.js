import fs from "fs";
import path from "path";
import crypto from "crypto";

function getSettings(ctx, payload) {
  const record = payload.config?.buildPlugins?.[ctx.pluginId];
  return {
    enabled: record?.enabled !== false,
    method: String(record?.settings?.method || "xor"),
    key: String(record?.settings?.key || ""),
    outputExt: String(record?.settings?.outputExt || ".exe"),
  };
}

function xorTransform(data, key) {
  if (!key) return data;
  const keyBuf = Buffer.from(key, "utf8");
  const out = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i] ^ keyBuf[i % keyBuf.length];
  }
  return out;
}

function rc4Transform(data, key) {
  if (!key) return data;
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  const keyBuf = Buffer.from(key, "utf8");
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + keyBuf[i % keyBuf.length]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = Buffer.alloc(data.length);
  let x = 0, y = 0;
  for (let k = 0; k < data.length; k++) {
    x = (x + 1) & 255;
    y = (y + S[x]) & 255;
    [S[x], S[y]] = [S[y], S[x]];
    out[k] = data[k] ^ S[(S[x] + S[y]) & 255];
  }
  return out;
}

function aesTransform(data, key) {
  const cipher = crypto.createCipheriv("aes-256-cbc", crypto.createHash("sha256").update(key).digest(), Buffer.alloc(16));
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export default {
  setup(ctx) {
    ctx.log.info("crypter-template plugin ready (demo XOR encryption)");
  },

  onBuildPrepare(ctx, payload) {
    const settings = getSettings(ctx, payload);
    if (!settings.enabled) return null;
    ctx.log.info(`build prepare: platforms=${payload.config?.platforms?.join(",")} method=${settings.method}`);
    return null;
  },

  onBuildTarget(ctx, payload) {
    const settings = getSettings(ctx, payload);
    if (!settings.enabled) return null;

    if (settings.method !== "xor" && payload.platform !== "windows-x64") {
      ctx.log.info(`skipping ${payload.platform} — RC4/AES demo only supports windows-x64`);
      return { skip: true };
    }

    return null;
  },

  onBuildArtifact(ctx, payload) {
    const settings = getSettings(ctx, payload);
    if (!settings.enabled) return null;

    if (!settings.key) {
      ctx.log.warn("no encryption key set — skipping transformation");
      return { message: "Crypter skipped: no key provided" };
    }

    const inputPath = payload.file.path;
    const filename = payload.file.filename;
    const ext = settings.outputExt || path.extname(filename);
    const baseName = path.basename(filename, path.extname(filename));
    const outputName = `${baseName}${ext}`;
    const outputPath = path.join(payload.outDir, outputName);

    try {
      const data = fs.readFileSync(inputPath);
      let transformed;

      switch (settings.method) {
        case "rc4":
          transformed = rc4Transform(data, settings.key);
          break;
        case "aes":
          transformed = aesTransform(data, settings.key);
          break;
        case "xor":
        default:
          transformed = xorTransform(data, settings.key);
          break;
      }

      fs.writeFileSync(outputPath, transformed);

      ctx.log.info(`${settings.method.toUpperCase()} transformed ${data.length} bytes -> ${outputName} (${transformed.length} bytes)`);
      return {
        file: { filename: outputName },
        message: `${settings.method.toUpperCase()} encryption applied: ${outputName}`,
      };
    } catch (err) {
      ctx.log.error(`crypter failed: ${err.message}`);
      return { message: `Crypter failed: ${err.message}` };
    }
  },

  onBuildComplete(ctx, payload) {
    const settings = getSettings(ctx, payload);
    if (!settings.enabled) return null;
    ctx.log.info(`build ${payload.buildId} completed with ${settings.method} encryption`);
  },

  onBuildFailed(ctx, payload) {
    const settings = getSettings(ctx, payload);
    if (!settings.enabled) return null;
    ctx.log.warn(`build ${payload.buildId} failed: ${payload.error}`);
  },
};
