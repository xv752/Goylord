export async function loadSharedUiSettings(scope) {
  try {
    const res = await fetch(`/api/ui-settings/${encodeURIComponent(scope)}`, {
      credentials: "include",
    });
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return data && typeof data.settings === "object" && data.settings ? data.settings : {};
  } catch (err) {
    console.warn(`ui-settings: failed to load ${scope}`, err);
    return {};
  }
}

export function createSharedUiSettingsSaver(scope, readSettings, delayMs = 350) {
  let timer = null;
  let lastPayload = "";

  async function saveNow() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    let settings = {};
    try {
      settings = readSettings() || {};
    } catch (err) {
      console.warn(`ui-settings: failed to read ${scope}`, err);
      return;
    }

    const payload = JSON.stringify(settings);
    if (payload === lastPayload) return;
    lastPayload = payload;

    try {
      const res = await fetch(`/api/ui-settings/${encodeURIComponent(scope)}`, {
        method: "PUT",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) {
        lastPayload = "";
      }
    } catch (err) {
      lastPayload = "";
      console.warn(`ui-settings: failed to save ${scope}`, err);
    }
  }

  function scheduleSave() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(saveNow, delayMs);
  }

  return { scheduleSave, saveNow };
}
