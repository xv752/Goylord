<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { clientApi } from "@/api/client";
import type { Client } from "@/api/types";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const client = ref<Client | null>(null);
const loading = ref(true);
const connected = ref(false);
const error = ref("");
const currentPath = ref("C:\\");
const entries = ref<any[]>([]);
const selectedFile = ref<string | null>(null);
const downloading = ref(false);
const newFolderName = ref("");
const showNewFolderInput = ref(false);
const renameTarget = ref<string | null>(null);
const renameValue = ref("");
let ws: WebSocket | null = null;
let commandIdCounter = 0;

const wsUrl = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${clientId}/files/ws`;
};

const sortedEntries = computed(() => {
  const dirs = entries.value
    .filter((e) => e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.value
    .filter((e) => !e.isDir)
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...dirs, ...files];
});

const breadcrumbParts = computed(() => {
  const raw = currentPath.value.replace(/[\\/]+$/, "").split(/[\\/]/);
  return raw.filter(Boolean);
});

const quickNavItems = [
  { label: "C:\\", path: "C:\\" },
  { label: "D:\\", path: "D:\\" },
  { label: "Desktop", path: "C:\\Users\\Public\\Desktop" },
  { label: "Documents", path: "C:\\Users\\Public\\Documents" },
  { label: "Downloads", path: "C:\\Users\\Public\\Downloads" },
  { label: "Temp", path: "C:\\Windows\\Temp" },
];

async function fetchClient() {
  try {
    const res = await clientApi.list({ clientId });
    client.value = (res.items || []).find((c) => c.id === clientId) || null;
  } catch { /* silent */ } finally {
    loading.value = false;
  }
}

function connect() {
  if (ws) ws.close();
  error.value = "";
  try {
    ws = new WebSocket(wsUrl());
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      connected.value = true;
      sendFileList(currentPath.value);
    };
    ws.onclose = () => { connected.value = false; };
    ws.onerror = () => { error.value = "Connection failed"; connected.value = false; };
    ws.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const data = JSON.parse(raw);
        if (data.type === "file_list_result" && data.entries) {
          entries.value = data.entries;
          if (data.path) currentPath.value = data.path;
        } else if (data.type === "file_download" && data.data) {
          handleDownloadChunk(data);
        } else if (data.type === "command_result" && data.ok === false) {
          error.value = data.message || "Command failed";
        }
      } catch { /* silent */ }
    };
  } catch { error.value = "Failed to connect"; }
}

function sendRaw(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendFileList(path: string) {
  sendRaw({ type: "file_list", path });
}

const pendingDownloads = new Map<string, { chunks: Uint8Array[]; total: number }>();

function handleDownloadChunk(data: any) {
  const key = data.path;
  if (!pendingDownloads.has(key)) {
    pendingDownloads.set(key, { chunks: [], total: data.total });
    downloading.value = true;
  }
  const dl = pendingDownloads.get(key)!;
  if (data.data instanceof ArrayBuffer) {
    dl.chunks.push(new Uint8Array(data.data));
  } else if (typeof data.data === "string") {
    const binary = atob(data.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    dl.chunks.push(bytes);
  }
  const received = dl.chunks.reduce((sum, c) => sum + c.length, 0);
  if (received >= dl.total || data.offset + data.data.byteLength >= data.total) {
    const merged = new Uint8Array(dl.total);
    let offset = 0;
    for (const chunk of dl.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    pendingDownloads.delete(key);
    if (pendingDownloads.size === 0) downloading.value = false;
    const blob = new Blob([merged]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = key.split(/[\\/]/).pop() || "download";
    a.click();
    URL.revokeObjectURL(url);
  }
}

function downloadFile(path: string) {
  sendRaw({ type: "file_download", path });
}

function navigateTo(path: string) {
  selectedFile.value = null;
  sendFileList(path);
}

function navigateUp() {
  const cleaned = currentPath.value.replace(/[\\/]+$/, "");
  const idx = cleaned.lastIndexOf("\\");
  if (idx > 0) {
    navigateTo(cleaned.substring(0, idx + 1));
  }
}

function navigateBread(idx: number) {
  const base = breadcrumbParts.value.slice(0, idx + 1).join("\\");
  const path = idx === 0 ? base + "\\" : base;
  navigateTo(path);
}

function onEntryDblClick(entry: any) {
  if (entry.isDir) {
    const sep = entry.path.includes("/") ? "/" : "\\";
    navigateTo(entry.path.endsWith(sep) ? entry.path : entry.path + sep);
  }
}

function onEntryClick(entry: any) {
  if (!entry.isDir) {
    selectedFile.value = entry.path;
  } else {
    onEntryDblClick(entry);
  }
}

function quickNav(item: { path: string }) {
  navigateTo(item.path);
}

function handleRefresh() {
  sendFileList(currentPath.value);
}

function createFolder() {
  const name = newFolderName.value.trim();
  if (!name) return;
  const sep = currentPath.value.includes("/") ? "/" : "\\";
  const fullPath = currentPath.value + (currentPath.value.endsWith(sep) ? "" : sep) + name;
  sendRaw({ type: "file_mkdir", path: fullPath });
  showNewFolderInput.value = false;
  newFolderName.value = "";
  setTimeout(() => sendFileList(currentPath.value), 500);
}

function deleteSelected() {
  if (!selectedFile.value) return;
  sendRaw({ type: "file_delete", path: selectedFile.value });
  selectedFile.value = null;
  setTimeout(() => sendFileList(currentPath.value), 500);
}

function startRename(entry: any) {
  renameTarget.value = entry.path;
  renameValue.value = entry.name;
}

function confirmRename() {
  if (!renameTarget.value || !renameValue.value.trim()) return;
  const dir = renameTarget.value.replace(/[\\/][^\\/]+$/, "");
  const sep = dir.includes("/") ? "/" : "\\";
  sendRaw({
    type: "file_rename",
    source: renameTarget.value,
    destination: dir + sep + renameValue.value.trim(),
  });
  renameTarget.value = null;
  renameValue.value = "";
  setTimeout(() => sendFileList(currentPath.value), 500);
}

function cancelRename() {
  renameTarget.value = null;
  renameValue.value = "";
}

function formatSize(bytes: number | undefined | null) {
  if (bytes == null) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
}

function formatDate(ts: number | undefined | null) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reconnect() { connect(); }

onMounted(async () => {
  await fetchClient();
  connect();
});

onUnmounted(() => { ws?.close(); });
</script>

<template>
  <div class="h-full flex flex-col bg-slate-950">
    <div class="flex items-center gap-3 mb-4 flex-shrink-0">
      <button @click="router.back()" class="text-slate-400 hover:text-slate-200 transition-colors">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div v-if="loading" class="text-sm text-slate-400">Loading...</div>
      <template v-else-if="client">
        <h1 class="text-lg font-semibold text-slate-100">File Browser</h1>
        <span class="text-sm text-slate-400">{{ client.nickname || client.host }}</span>
      </template>
      <div class="ml-auto flex items-center gap-2">
        <span :class="['w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500']"></span>
        <button @click="reconnect" class="px-2.5 py-1 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors">
          <i class="fa-solid fa-rotate-right mr-1"></i>Reconnect
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-400 mb-2">{{ error }}</p>

    <div class="flex-1 flex gap-3 min-h-0">
      <aside class="w-44 flex-shrink-0 bg-slate-900 border border-slate-800 rounded-lg overflow-auto">
        <div class="px-3 py-2 border-b border-slate-800">
          <span class="text-xs text-slate-400 font-medium">Quick Navigation</span>
        </div>
        <div class="p-1">
          <button
            v-for="item in quickNavItems"
            :key="item.label"
            @click="quickNav(item)"
            class="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-slate-100 rounded transition-colors"
          >
            <i class="fa-solid fa-hard-drive mr-2 text-slate-500"></i>{{ item.label }}
          </button>
        </div>
      </aside>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center gap-2 mb-2 flex-shrink-0">
          <div class="flex-1 flex items-center gap-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs overflow-x-auto whitespace-nowrap">
            <button @click="navigateUp" class="text-slate-400 hover:text-slate-200 px-1 transition-colors" title="Go up">
              <i class="fa-solid fa-arrow-up"></i>
            </button>
            <span class="text-slate-600 mx-1">|</span>
            <template v-for="(part, i) in breadcrumbParts" :key="i">
              <button
                @click="navigateBread(i)"
                class="text-slate-300 hover:text-white px-1 transition-colors"
              >{{ part }}</button>
              <span v-if="i < breadcrumbParts.length - 1" class="text-slate-600">\</span>
            </template>
          </div>
          <button @click="handleRefresh" :disabled="!connected" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors" title="Refresh">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
          <button @click="showNewFolderInput = !showNewFolderInput" :disabled="!connected" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors" title="New folder">
            <i class="fa-solid fa-folder-plus"></i>
          </button>
          <button
            v-if="selectedFile"
            @click="downloadFile(selectedFile)"
            :disabled="!connected"
            class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            title="Download selected"
          >
            <i class="fa-solid fa-download"></i>
          </button>
          <button
            v-if="selectedFile"
            @click="deleteSelected"
            :disabled="!connected"
            class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-40 transition-colors"
            title="Delete selected"
          >
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>

        <div v-if="showNewFolderInput" class="flex items-center gap-2 mb-2 flex-shrink-0">
          <input
            v-model="newFolderName"
            type="text"
            placeholder="Folder name"
            class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-700"
            @keydown.enter="createFolder"
          />
          <button @click="createFolder" class="px-3 py-1.5 text-xs rounded bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition-colors">
            <i class="fa-solid fa-check mr-1"></i>Create
          </button>
          <button @click="showNewFolderInput = false; newFolderName = ''" class="px-3 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 transition-colors">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-lg">
          <div v-if="!connected" class="flex items-center justify-center h-full text-slate-500 text-sm">
            Not connected
          </div>
          <table v-else class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs text-slate-400 border-b border-slate-800">
                <th class="px-3 py-2">Name</th>
                <th class="px-3 py-2 w-28">Size</th>
                <th class="px-3 py-2 w-44">Modified</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="currentPath !== 'C:\\' && currentPath !== '/'"
                class="border-b border-slate-800/50 hover:bg-slate-800/50 cursor-pointer"
                @click="navigateUp"
              >
                <td class="px-3 py-2 text-slate-300">
                  <i class="fa-solid fa-arrow-up mr-2 text-slate-500"></i>..
                </td>
                <td class="px-3 py-2 text-slate-500 text-xs">-</td>
                <td class="px-3 py-2 text-slate-500 text-xs">-</td>
              </tr>
              <tr
                v-for="entry in sortedEntries"
                :key="entry.path"
                :class="[
                  'border-b border-slate-800/50 cursor-pointer transition-colors',
                  selectedFile === entry.path ? 'bg-blue-900/20 border-blue-800/30' : 'hover:bg-slate-800/50',
                ]"
                @click="onEntryClick(entry)"
                @dblclick="onEntryDblClick(entry)"
              >
                <td class="px-3 py-2 text-slate-200">
                  <i
                    :class="[
                      entry.isDir ? 'fa-solid fa-folder text-amber-500' : 'fa-solid fa-file text-slate-500',
                      'mr-2',
                    ]"
                  ></i>
                  <template v-if="renameTarget === entry.path">
                    <input
                      v-model="renameValue"
                      type="text"
                      class="w-48 px-1.5 py-0.5 bg-slate-800 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none"
                      @keydown.enter="confirmRename"
                      @keydown.esc="cancelRename"
                      @click.stop
                      autofocus
                    />
                  </template>
                  <template v-else>
                    {{ entry.name }}
                  </template>
                </td>
                <td class="px-3 py-2 text-slate-500 text-xs">{{ entry.isDir ? "-" : formatSize(entry.size) }}</td>
                <td class="px-3 py-2 text-slate-500 text-xs">{{ formatDate(entry.modTime) }}</td>
              </tr>
              <tr v-if="sortedEntries.length === 0 && connected">
                <td colspan="3" class="px-3 py-8 text-center text-slate-500 text-sm">
                  <i class="fa-solid fa-folder-open mr-2"></i>Empty directory
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between mt-2 px-1 flex-shrink-0">
          <span class="text-xs text-slate-500">{{ currentPath }}</span>
          <span class="text-xs text-slate-500">{{ sortedEntries.length }} items</span>
        </div>
      </div>
    </div>
  </div>
</template>
