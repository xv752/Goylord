export interface NavItem {
  path: string;
  label: string;
  icon: string;
  iconColor: string;
  access?: "any" | "no-viewer" | "admin" | "admin-or-operator";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Matches old UI nav/template.js NAV_GROUPS exactly
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Clients",
    items: [
      { path: "/", label: "Clients", icon: "fa-solid fa-display", iconColor: "text-sky-400" },
    ],
  },
  {
    label: "Purgatory",
    items: [
      { path: "/purgatory", label: "Purgatory", icon: "fa-solid fa-user-clock", iconColor: "text-amber-400", access: "admin-or-operator" },
    ],
  },
  {
    label: "System",
    items: [
      { path: "/logs", label: "Logs", icon: "fa-solid fa-clipboard-list", iconColor: "text-amber-400", access: "any" },
      { path: "/users", label: "Users", icon: "fa-solid fa-users", iconColor: "text-indigo-400", access: "admin" },
      { path: "/notifications", label: "Notifications", icon: "fa-solid fa-bell", iconColor: "text-yellow-400", access: "admin-or-operator" },
    ],
  },
  {
    label: "Management",
    items: [
      { path: "/scripts", label: "Scripts", icon: "fa-solid fa-code", iconColor: "text-cyan-400", access: "no-viewer" },
      { path: "/socks5", label: "Proxies", icon: "fa-solid fa-network-wired", iconColor: "text-sky-400", access: "no-viewer" },
      { path: "/sol-publish", label: "Sol Publish", icon: "fa-solid fa-link-slash", iconColor: "text-purple-400", access: "admin" },
    ],
  },
  {
    label: "Build",
    items: [
      { path: "/build", label: "Builder", icon: "fa-solid fa-hammer", iconColor: "text-orange-400", access: "admin-or-operator" },
      { path: "/plugins", label: "Plugins", icon: "fa-solid fa-puzzle-piece", iconColor: "text-violet-400", access: "admin-or-operator" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { path: "/metrics", label: "Metrics", icon: "fa-solid fa-chart-line", iconColor: "text-emerald-400" },
      { path: "/screenshots", label: "Screenshot Wall", icon: "fa-solid fa-images", iconColor: "text-sky-400", access: "no-viewer" },
    ],
  },
];

// Client context menu actions — NOT sidebar items, accessed via right-click on client card
export const CLIENT_MENU_GROUPS = [
  {
    label: "Remote Access",
    items: [
      { key: "console", label: "Console", icon: "fa-solid fa-terminal", color: "text-emerald-400" },
      { key: "remotedesktop", label: "Remote Desktop", icon: "fa-solid fa-desktop", color: "text-purple-400" },
      { key: "backstage", label: "Backstage", icon: "fa-solid fa-ghost", color: "text-violet-400" },
      { key: "voice", label: "Voice", icon: "fa-solid fa-headset", color: "text-teal-400" },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { key: "webcam", label: "Webcam", icon: "fa-solid fa-video", color: "text-emerald-400" },
      { key: "keylogger", label: "Keylogger", icon: "fa-solid fa-keyboard", color: "text-yellow-400" },
      { key: "processes", label: "Process Manager", icon: "fa-solid fa-list-check", color: "text-orange-400" },
    ],
  },
  {
    label: "System",
    items: [
      { key: "filebrowser", label: "File Browser", icon: "fa-solid fa-folder-tree", color: "text-blue-400" },
      { key: "winre", label: "WinRE Persist", icon: "fa-solid fa-shield-halved", color: "text-amber-400" },
    ],
  },
];
