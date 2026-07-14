import path from "path";
import fs from "fs";

export function resolveRuntimeRoot(cwd: string = process.cwd()): string {
  const explicitRoot = process.env.GOYLORD_ROOT?.trim();
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  if (fs.existsSync(path.join(cwd, "Goylord-Client"))) {
    return cwd;
  }

  return path.resolve(cwd, "..");
}
