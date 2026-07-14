export type DeployOs = "windows" | "mac" | "linux" | "unix" | "unknown";

function isLinuxOs(val: string): boolean {
  if (val.includes("linux")) return true;
  const linuxDistros = [
    "ubuntu", "debian", "fedora", "centos", "rhel", "red hat",
    "rocky", "alma", "manjaro", "arch", "kali", "opensuse", "suse",
    "raspbian", "raspberry", "nixos", "gentoo", "alpine",
    "mint", "pop!_os", "pop os", "pop-os", "void", "slackware",
    "android", "mariner", "cbl", "amzn", "oracle",
  ];
  return linuxDistros.some((d) => val.includes(d));
}

export function normalizeClientOs(os?: string, osFamily?: string): DeployOs {
  if (osFamily) {
    const f = osFamily.toLowerCase();
    if (f === "windows") return "windows";
    if (f === "linux") return "linux";
    if (f === "mac") return "mac";
    return "unknown";
  }
  const val = String(os || "").toLowerCase();
  if (val.includes("windows")) return "windows";
  if (val.includes("darwin") || val.includes("mac")) return "mac";
  if (isLinuxOs(val)) return "linux";
  return "unknown";
}

export function detectUploadOs(filename: string, bytes: Uint8Array): DeployOs {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".exe") || lower.endsWith(".msi") || lower.endsWith(".bat") || lower.endsWith(".cmd") || lower.endsWith(".ps1")) {
    return "windows";
  }
  if (lower.endsWith(".dmg") || lower.endsWith(".pkg") || lower.endsWith(".app")) {
    return "mac";
  }
  if (lower.endsWith(".sh")) {
    return "unix";
  }
  if (lower.endsWith(".run")) {
    return "linux";
  }

  if (bytes.length >= 4) {
    const b0 = bytes[0];
    const b1 = bytes[1];
    const b2 = bytes[2];
    const b3 = bytes[3];
    if (b0 === 0x4d && b1 === 0x5a) return "windows";
    if (b0 === 0x7f && b1 === 0x45 && b2 === 0x4c && b3 === 0x46) return "linux";
    const magic = (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
    if (magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcefaedfe || magic === 0xcafebabe) {
      return "mac";
    }
  }

  if (bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21) {
    return "unix";
  }

  return "unknown";
}
