import { dropdownItem, sidebarChild } from "./template.js";

export async function loadPluginNavItems(activeMap) {
  try {
    const res = await fetch("/api/plugins");
    if (!res.ok) return;

    const data = await res.json();
    const plugins = data.plugins;
    if (!plugins || !Array.isArray(plugins)) return;

    const navPlugins = plugins.filter(
      (p) => p.navbar && p.enabled
    );

    if (navPlugins.length === 0) return;

    const isSidebar = document.querySelector(".sb-group[data-group='plugin_apps']");
    const wg = document.querySelector(".nav-dd-wrapper[data-group='plugin_apps']");
    const container = isSidebar ? document.querySelector(".sb-group[data-group='plugin_apps']") : wg;

    if (!container) return;

    const childContainer = isSidebar
      ? container.querySelector(".sb-group-children")
      : container.querySelector(".nav-dd-menu");

    if (!childContainer) return;

    const itemsHtml = navPlugins.map((p) => {
      const linkId = `plugin-nav-${p.id}`;
      activeMap[`/plugins/${p.id}`] = linkId;

      const childObj = {
        href: `/plugins/${p.id}`,
        label: p.navbar.label || p.name,
        icon: p.navbar.icon || "fa-cube",
        iconColor: "text-slate-300",
        linkId: linkId,
      };

      return isSidebar ? sidebarChild(childObj) : dropdownItem(childObj);
    }).join("");

    childContainer.innerHTML = itemsHtml;
    container.classList.remove("hidden");

  } catch (err) {
    console.error("Failed to load plugin nav items", err);
  }
}
