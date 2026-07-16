import fs from "fs";
import path from "path";

function buildEnabled(ctx, payload) {
  const record = payload.config?.buildPlugins?.[ctx.pluginId];
  return record?.enabled !== false;
}

export default {
  setup(ctx) {
    ctx.log.info("base64-encoder plugin ready");
  },

  onBuildArtifact(ctx, payload) {
    if (!buildEnabled(ctx, payload)) return null;

    const inputPath = payload.file.path;
    const filename = payload.file.filename;
    const ext = path.extname(filename);
    const baseName = path.basename(filename, ext);
    const outputName = `${baseName}.b64`;
    const outputPath = path.join(payload.outDir, outputName);

    try {
      const data = fs.readFileSync(inputPath);
      const encoded = data.toString("base64");
      fs.writeFileSync(outputPath, encoded, "utf8");

      const ratio = ((encoded.length / data.length) * 100).toFixed(1);
      ctx.log.info(`encoded ${data.length} bytes -> ${outputName} (${encoded.length} chars, ${ratio}% ratio)`);

      return {
        file: { filename: outputName },
        message: `Base64-encoded ${data.length} bytes into ${outputName}`,
      };
    } catch (err) {
      ctx.log.error(`base64 encoding failed: ${err.message}`);
      return { message: `Base64 encoding failed: ${err.message}` };
    }
  },

  onBuildComplete(ctx, payload) {
    if (!buildEnabled(ctx, payload)) return null;
    ctx.log.info(`build ${payload.buildId} completed with base64 encoding`);
  },
};
