(() => {
  const PLUGIN_ID = "regedit";
  const params = new URLSearchParams(window.location.search);

  const clientInput = document.getElementById("client-id");
  const pathInput = document.getElementById("path-input");
  const keyTree = document.getElementById("key-tree");
  const valueBody = document.getElementById("value-body");
  const currentKey = document.getElementById("current-key");
  const statusPill = document.getElementById("status-pill");
  const logEl = document.getElementById("log");
  const navButtons = [
    document.getElementById("btn-refresh"),
    document.getElementById("btn-up"),
    document.getElementById("btn-go"),
  ].filter(Boolean);

  const valueDialog = document.getElementById("value-dialog");
  const valueTitle = document.getElementById("value-dialog-title");
  const valueName = document.getElementById("value-name");
  const valueType = document.getElementById("value-type");
  const valueData = document.getElementById("value-data");
  const saveValueBtn = document.getElementById("btn-save-value");

  const regDialog = document.getElementById("reg-dialog");
  const regTitle = document.getElementById("reg-dialog-title");
  const regText = document.getElementById("reg-text");
  const runImportBtn = document.getElementById("btn-run-import");

  const ROOT_PATH = "Computer";
  const HIVES = [
    ["HKEY_CLASSES_ROOT", "HKCR"],
    ["HKEY_CURRENT_USER", "HKCU"],
    ["HKEY_LOCAL_MACHINE", "HKLM"],
    ["HKEY_USERS", "HKU"],
    ["HKEY_CURRENT_CONFIG", "HKCC"],
  ];

  let activePath = ROOT_PATH;
  let lastGoodPath = ROOT_PATH;
  let pendingBrowsePath = null;
  let isBrowsing = false;
  let editingOriginalName = null;
  let pollTimer = null;

  clientInput.value = params.get("clientId") || "";

  function log(line) {
    const ts = new Date().toLocaleTimeString();
    logEl.textContent = `${ts} ${line}\n` + logEl.textContent;
  }

  function setStatus(text) {
    statusPill.textContent = text;
    statusPill.classList.toggle("loading", text === "Loading");
  }

  function setBrowsing(browsing) {
    isBrowsing = browsing;
    document.body.classList.toggle("regedit-browsing", browsing);
    for (const btn of navButtons) btn.disabled = browsing;
  }

  function getClientId() {
    return clientInput.value.trim();
  }

  async function sendEvent(event, payload = {}) {
    const clientId = getClientId();
    if (!clientId) {
      log("Missing clientId");
      throw new Error("Missing clientId");
    }
    setStatus("Working");
    const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/plugins/${PLUGIN_ID}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
    });
    if (!res.ok) {
      const text = await res.text();
      setStatus("Error");
      log(`Send failed: ${res.status} ${text}`);
      throw new Error(text);
    }
    log(`Sent ${event}`);
  }

  async function pollEvents() {
    const clientId = getClientId();
    if (!clientId) return;
    try {
      const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/plugins/${PLUGIN_ID}/events`);
      if (!res.ok) return;
      const data = await res.json();
      for (const item of data.events || []) handlePluginEvent(item.event, item.payload);
    } catch (_) {}
  }

  function handlePluginEvent(event, payload) {
    if (event === "ready") {
      log(payload?.message || "Registry editor ready");
      return;
    }
    if (event !== "registry_result") return;
    setStatus(payload?.ok ? "Ready" : "Error");
    if (!payload?.ok) {
      const action = payload?.action || "operation";
      const error = payload?.error || "unknown error";
      log(`${action} failed: ${error}`);
      if (action === "list_key") {
        const failedPath = pendingBrowsePath || pathInput.value || activePath;
        activePath = lastGoodPath;
        pendingBrowsePath = null;
        setBrowsing(false);
        pathInput.value = activePath;
        currentKey.textContent = activePath;
        currentKey.title = activePath;
        setStatus("Blocked");
        alert(`Cannot open ${failedPath}.\n\n${error}`);
      }
      return;
    }
    if (payload.action === "list_key") {
      activePath = payload.path || activePath;
      lastGoodPath = activePath;
      pendingBrowsePath = null;
      setBrowsing(false);
      pathInput.value = activePath;
      currentKey.textContent = activePath;
      currentKey.title = activePath;
      renderKeys(payload.subkeys || []);
      renderValues(payload.values || []);
      log(`Loaded ${activePath}`);
    } else if (payload.action === "export_key") {
      regTitle.textContent = `Export ${payload.path || activePath}`;
      regText.value = payload.content || "";
      runImportBtn.style.display = "none";
      regDialog.showModal();
      log(`Exported ${payload.path || activePath}`);
    } else {
      log(`${payload.action || "operation"} completed`);
      listKey(activePath);
    }
  }

  function renderKeys(keys) {
    keyTree.innerHTML = "";
    if (activePath === ROOT_PATH) {
      for (const [label, path] of HIVES) {
        keyTree.appendChild(keyButton(label, path, "hive"));
      }
      return;
    }
    const up = parentPath(activePath);
    if (up) {
      const row = keyButton("..", up, "up");
      keyTree.appendChild(row);
    }
    for (const key of keys) {
      keyTree.appendChild(keyButton(key, `${activePath}\\${key}`, "key"));
    }
  }

  function keyButton(label, path, iconType) {
    const btn = document.createElement("button");
    btn.className = "key-row";
    btn.innerHTML = `<span class="key-icon ${iconType}" aria-hidden="true"></span><span class="name"></span>`;
    btn.querySelector(".name").textContent = label;
    btn.title = path;
    btn.addEventListener("click", () => listKey(path));
    return btn;
  }

  function renderValues(values) {
    valueBody.innerHTML = "";
    if (!values.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="4" class="value-data">No values in this key.</td>`;
      valueBody.appendChild(tr);
      return;
    }
    for (const value of values) {
      const tr = document.createElement("tr");
      const displayName = value.name || "(Default)";
      const type = value.type || "REG_NONE";
      tr.innerHTML = `
        <td><span class="value-name"><span class="value-icon"></span><span class="value-label"></span></span></td>
        <td></td>
        <td><div class="value-data"></div></td>
        <td><div class="row-actions"></div></td>
      `;
      tr.children[0].title = displayName;
      tr.querySelector(".value-label").textContent = displayName;
      tr.querySelector(".value-icon").classList.add(valueIconClass(type));
      tr.children[1].textContent = type;
      tr.querySelector(".value-data").textContent = value.data ?? "";
      tr.querySelector(".value-data").title = value.data ?? "";
      const actions = tr.querySelector(".row-actions");
      const edit = document.createElement("button");
      edit.className = "btn";
      edit.innerHTML = `<i class="fa-solid fa-pen"></i>`;
      edit.title = "Edit value";
      edit.addEventListener("click", () => openValueDialog(value));
      const del = document.createElement("button");
      del.className = "btn danger";
      del.innerHTML = `<i class="fa-solid fa-trash"></i>`;
      del.title = "Delete value";
      del.addEventListener("click", () => deleteValue(value.name || ""));
      actions.append(edit, del);
      valueBody.appendChild(tr);
    }
  }

  function renderLoading(path) {
    keyTree.innerHTML = `
      <div class="loading-panel">
        <span class="loading-spinner" aria-hidden="true"></span>
        <span>Opening ${escapeHtml(path)}</span>
      </div>
    `;
    valueBody.innerHTML = `
      <tr>
        <td colspan="4">
          <div class="loading-panel table-loading">
            <span class="loading-spinner" aria-hidden="true"></span>
            <span>Enumerating values and subkeys...</span>
          </div>
        </td>
      </tr>
    `;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function valueIconClass(type) {
    if (type === "REG_SZ" || type === "REG_EXPAND_SZ" || type === "REG_MULTI_SZ") {
      return "string";
    }
    if (type === "REG_DWORD" || type === "REG_QWORD") return "number";
    if (type === "REG_BINARY") return "binary";
    return "unknown";
  }

  function parentPath(path) {
    if (path === ROOT_PATH) return null;
    const i = path.lastIndexOf("\\");
    return i > 0 ? path.slice(0, i) : ROOT_PATH;
  }

  function listKey(path) {
    if (isBrowsing) return Promise.resolve();
    const targetPath = normalizePath(path);
    if (targetPath === ROOT_PATH) {
      activePath = ROOT_PATH;
      lastGoodPath = ROOT_PATH;
      pendingBrowsePath = null;
      pathInput.value = activePath;
      currentKey.textContent = activePath;
      currentKey.title = activePath;
      setStatus("Ready");
      setBrowsing(false);
      renderKeys([]);
      renderValues([]);
      log("Loaded Computer");
      return Promise.resolve();
    }
    pendingBrowsePath = targetPath;
    pathInput.value = targetPath;
    currentKey.textContent = targetPath;
    currentKey.title = targetPath;
    setStatus("Loading");
    setBrowsing(true);
    renderLoading(targetPath);
    log(`Opening ${targetPath}`);
    return sendEvent("list_key", { path: targetPath });
  }

  function normalizePath(path) {
    const raw = (path || "").trim();
    if (!raw || raw.toLowerCase() === "computer" || raw === "\\") return ROOT_PATH;
    return raw.replace(/^Computer\\/i, "");
  }

  function openValueDialog(value) {
    editingOriginalName = value ? value.name || "" : null;
    valueTitle.textContent = value ? "Edit Value" : "New Value";
    valueName.value = value ? value.name || "" : "";
    valueType.value = value ? value.type || "REG_SZ" : "REG_SZ";
    valueData.value = value ? value.data || "" : "";
    valueDialog.showModal();
  }

  function deleteValue(name) {
    const display = name || "(Default)";
    if (!confirm(`Delete value ${display}?`)) return;
    sendEvent("delete_value", { path: activePath, name });
  }

  document.getElementById("btn-refresh").addEventListener("click", () => listKey(pathInput.value));
  document.getElementById("btn-go").addEventListener("click", () => listKey(pathInput.value));
  document.getElementById("btn-up").addEventListener("click", () => {
    const up = parentPath(activePath);
    if (up) listKey(up);
  });

  document.getElementById("btn-new-key").addEventListener("click", () => {
    if (activePath === ROOT_PATH) {
      alert("Select a hive first.");
      return;
    }
    const name = prompt("New key name");
    if (!name) return;
    sendEvent("create_key", { path: `${activePath}\\${name}` });
  });

  document.getElementById("btn-delete-key").addEventListener("click", () => {
    if (activePath === ROOT_PATH || parentPath(activePath) === ROOT_PATH) {
      alert("Root hives cannot be deleted.");
      return;
    }
    if (!confirm(`Delete key and all subkeys?\n${activePath}`)) return;
    const next = parentPath(activePath);
    sendEvent("delete_key", { path: activePath, nextPath: next });
    activePath = next;
  });

  document.getElementById("btn-new-value").addEventListener("click", () => {
    if (activePath === ROOT_PATH) {
      alert("Select a registry key first.");
      return;
    }
    openValueDialog(null);
  });

  saveValueBtn.addEventListener("click", (event) => {
    event.preventDefault();
    const payload = {
      path: activePath,
      name: valueName.value,
      oldName: editingOriginalName,
      type: valueType.value,
      data: valueData.value,
    };
    valueDialog.close();
    sendEvent("set_value", payload);
  });

  document.getElementById("btn-export").addEventListener("click", () => {
    if (activePath === ROOT_PATH) {
      alert("Select a hive or key to export.");
      return;
    }
    sendEvent("export_key", { path: activePath });
  });

  document.getElementById("btn-import").addEventListener("click", () => {
    regTitle.textContent = "Import .reg";
    regText.value = "Windows Registry Editor Version 5.00\n\n";
    runImportBtn.style.display = "";
    regDialog.showModal();
  });

  runImportBtn.addEventListener("click", (event) => {
    event.preventDefault();
    if (!confirm("Import this .reg data on the remote client?")) return;
    const content = regText.value;
    regDialog.close();
    sendEvent("import_reg", { content, refreshPath: activePath });
  });

  pathInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") listKey(pathInput.value);
  });

  clientInput.addEventListener("change", () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollEvents, 900);
    listKey(pathInput.value || ROOT_PATH).catch(() => {});
  });

  pollTimer = setInterval(pollEvents, 900);
  listKey(activePath).catch(() => {});
})();
