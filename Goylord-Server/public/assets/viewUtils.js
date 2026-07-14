export function countryToFlag(code) {
  const fallback = `<span class="fi fi-so"></span>`;
  if (!code) return fallback;
  const cc = String(code).trim().toLowerCase();

  if (!/^[a-z]{2}$/.test(cc) || cc === "zz") return fallback;
  return `<span class="fi fi-${cc}"></span>`;
}

export function formatPing(ms) {
  if (ms === null || ms === undefined) return "measuring…";
  return `${ms} ms`;
}

export function formatAgo(ts) {
  const delta = Date.now() - ts;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function shortId(id = "") {
  if (!id) return "unknown";
  return id.length <= 8 ? id : `${id.slice(0, 6)}…${id.slice(-2)}`;
}

export function osBadge(osRaw = "") {
  const os = osRaw.toLowerCase();
  const base = {
    label: osRaw || "Unknown",
    icon: "fa-solid fa-circle-question",
    tone: "pill-unknown",
  };
  if (os.includes("windows 11"))
    return { label: "W11", icon: "fa-brands fa-windows", tone: "pill-win" };
  if (os.includes("windows 10"))
    return { label: "W10", icon: "fa-brands fa-windows", tone: "pill-win" };
  if (os.includes("windows"))
    return { label: "Windows", icon: "fa-brands fa-windows", tone: "pill-win" };
  if (os.includes("mac") || os.includes("darwin"))
    return { label: "macOS", icon: "fa-brands fa-apple", tone: "pill-mac" };
  if (os.includes("linux mint"))
    return { label: "Mint", icon: "cv-os-icon cv-os-icon-mint", tone: "pill-mint" };
  if (os.includes("pop!_os") || os.includes("pop os") || os.includes("pop-os"))
    return { label: "Pop!_OS", icon: "cv-os-icon cv-os-icon-pop", tone: "pill-pop" };
  if (os.includes("ubuntu"))
    return { label: "Ubuntu", icon: "fa-brands fa-ubuntu", tone: "pill-ubuntu" };
  if (os.includes("debian"))
    return { label: "Debian", icon: "fa-brands fa-debian", tone: "pill-debian" };
  if (os.includes("manjaro"))
    return { label: "Manjaro", icon: "cv-os-icon cv-os-icon-manjaro", tone: "pill-manjaro" };
  if (os.includes("arch"))
    return { label: "Arch", icon: "cv-os-icon cv-os-icon-arch", tone: "pill-arch" };
  if (os.includes("kali"))
    return { label: "Kali", icon: "cv-os-icon cv-os-icon-kali", tone: "pill-kali" };
  if (os.includes("fedora"))
    return { label: "Fedora", icon: "fa-brands fa-fedora", tone: "pill-fedora" };
  if (os.includes("red hat") || os.includes("rhel"))
    return { label: "RHEL", icon: "fa-brands fa-redhat", tone: "pill-redhat" };
  if (os.includes("rocky"))
    return { label: "Rocky", icon: "cv-os-icon cv-os-icon-rocky", tone: "pill-rocky" };
  if (os.includes("alma"))
    return { label: "Alma", icon: "cv-os-icon cv-os-icon-alma", tone: "pill-alma" };
  if (os.includes("centos"))
    return { label: "CentOS", icon: "fa-brands fa-centos", tone: "pill-centos" };
  if (os.includes("opensuse"))
    return { label: "openSUSE", icon: "fa-brands fa-opensuse", tone: "pill-suse" };
  if (os.includes("suse"))
    return { label: "SUSE", icon: "fa-brands fa-suse", tone: "pill-suse" };
  if (os.includes("raspbian") || os.includes("raspberry"))
    return { label: "Raspberry Pi", icon: "fa-brands fa-raspberry-pi", tone: "pill-raspi" };
  if (os.includes("freebsd"))
    return { label: "FreeBSD", icon: "fa-brands fa-freebsd", tone: "pill-freebsd" };
  if (os.includes("nixos") || os.includes("nix os"))
    return { label: "NixOS", icon: "cv-os-icon cv-os-icon-nixos", tone: "pill-nixos" };
  if (os.includes("gentoo"))
    return { label: "Gentoo", icon: "cv-os-icon cv-os-icon-gentoo", tone: "pill-gentoo" };
  if (os.includes("alpine"))
    return { label: "Alpine", icon: "cv-os-icon cv-os-icon-alpine", tone: "pill-alpine" };
  if (os.includes("android"))
    return { label: "Android", icon: "fa-brands fa-android", tone: "pill-android" };
  if (os.includes("linux"))
    return { label: "Linux", icon: "fa-brands fa-linux", tone: "pill-linux" };
  return base;
}

export function archBadge(archRaw = "") {
  const arch = archRaw.toLowerCase();
  if (arch.includes("arm"))
    return { label: archRaw || "ARM", icon: "fa-microchip", tone: "pill-arm" };
  if (arch.includes("64") || arch.includes("x86") || arch.includes("amd"))
    return { label: archRaw || "x64", icon: "fa-microchip", tone: "pill-x64" };
  if (!archRaw)
    return { label: "arch?", icon: "fa-microchip", tone: "pill-unknown" };
  return { label: archRaw, icon: "fa-microchip", tone: "pill-ghost" };
}

export function versionBadge(versionRaw = "") {
  const label = versionRaw ? `v${versionRaw}` : "v0";
  return {
    label,
    icon: "fa-tag",
    tone: versionRaw ? "pill-version" : "pill-unknown",
  };
}

export function monitorsBadge(count) {
  const n = Number(count) || 1;
  const label = `${n} monitor${n > 1 ? "s" : ""}`;
  return { label, icon: "fa-display", tone: "pill-ghost" };
}
