<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { clientApi } from "@/api/client";
import type { Client, ProcessInfo } from "@/api/types";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const client = ref<Client | null>(null);
const loading = ref(true);
const connected = ref(false);
const error = ref("");
const search = ref("");
const processes = ref<ProcessInfo[]>([]);
const autoRefresh = ref(true);
const sortKey = ref<"pid" | "name" | "cpu" | "memory" | "username">("name");
const sortAsc = ref(true);
const killConfirmPid = ref<number | null>(null);
let ws: WebSocket | null = null;
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

const wsUrl = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${clientId}/processes/ws`;
};

const filteredProcesses = computed(() => {
  let list = processes.value;
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.username || "").toLowerCase().includes(q) ||
        (p.exePath || "").toLowerCase().includes(q) ||
        String(p.pid).includes(q)
    );
  }
  list = [...list].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    switch (sortKey.value) {
      case "pid":
        av = a.pid;
        bv = b.pid;
        break;
      case "name":
        av = a.name.toLowerCase();
        bv = b.name.toLowerCase();
        break;
      case "cpu":
        av = a.cpu || 0;
        bv = b.cpu || 0;
        break;
      case "memory":
        av = a.memory || 0;
        bv = b.memory || 0;
        break;
      case "username":
        av = (a.username || "").toLowerCase();
        bv = (b.username || "").toLowerCase();
        break;
      default:
        av = 0;
        bv = 0;
    }
    if (av < bv) return sortAsc.value ? -1 : 1;
    if (av > bv) return sortAsc.value ? 1 : -1;
    return 0;
  });
  return list;
});

function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = true;
  }
}

function sortIndicator(key: typeof sortKey.value) {
  if (sortKey.value !== key) return "";
  return sortAsc.value ? " \u25B2" : " \u25BC";
}

async function fetchClient() {
  try {
    const res = await clientApi.list({ clientId });
    client.value = res.items.find((c) => c.id === clientId) || null;
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
      requestProcessList();
    };
    ws.onclose = () => {
      connected.value = false;
      stopAutoRefresh();
    };
    ws.onerror = () => { error.value = "Connection failed"; connected.value = false; };
    ws.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data);
        const data = JSON.parse(raw);
        if (data.type === "process_list_result" && data.processes) {
          processes.value = data.processes;
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

function requestProcessList() {
  sendRaw({ type: "process_list" });
}

function refresh() {
  requestProcessList();
}

function startAutoRefresh() {
  stopAutoRefresh();
  autoRefreshTimer = setInterval(() => {
    if (connected.value) requestProcessList();
  }, 3000);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }
}

function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value;
  if (autoRefresh.value) {
    startAutoRefresh();
  } else {
    stopAutoRefresh();
  }
}

function killProcess(pid: number) {
  if (killConfirmPid.value === pid) {
    sendRaw({ type: "process_kill", pid });
    killConfirmPid.value = null;
    setTimeout(() => requestProcessList(), 500);
  } else {
    killConfirmPid.value = pid;
    setTimeout(() => { killConfirmPid.value = null; }, 3000);
  }
}

function cpuColor(cpu: number) {
  if (cpu < 10) return "text-green-400";
  if (cpu < 50) return "text-amber-400";
  return "text-red-400";
}

function memColor(mem: number) {
  if (mem < 100) return "text-green-400";
  if (mem < 512) return "text-amber-400";
  return "text-red-400";
}

function formatMem(mb: number | undefined | null) {
  if (mb == null) return "-";
  if (mb >= 1024) return (mb / 1024).toFixed(1) + " GB";
  return mb.toFixed(0) + " MB";
}

function formatCpu(cpu: number | undefined | null) {
  if (cpu == null) return "-";
  return cpu.toFixed(1);
}

function reconnect() {
  startAutoRefresh();
  connect();
}

onMounted(async () => {
  await fetchClient();
  connect();
  if (autoRefresh.value) startAutoRefresh();
});

onUnmounted(() => {
  ws?.close();
  stopAutoRefresh();
});
</script>

<template>
  <div class="h-full flex flex-col bg-slate-950">
    <div class="flex items-center gap-3 mb-4 flex-shrink-0">
      <button @click="router.back()" class="text-slate-400 hover:text-slate-200 transition-colors">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div v-if="loading" class="text-sm text-slate-400">Loading...</div>
      <template v-else-if="client">
        <h1 class="text-lg font-semibold text-slate-100">Processes</h1>
        <span class="text-sm text-slate-400">{{ client.nickname || client.host }}</span>
      </template>
      <div class="ml-auto flex items-center gap-2">
        <span class="text-xs text-slate-500">{{ filteredProcesses.length }} / {{ processes.length }} processes</span>
        <button
          @click="toggleAutoRefresh"
          :class="[
            'px-2.5 py-1.5 text-xs rounded border transition-colors',
            autoRefresh
              ? 'bg-blue-900/30 border-blue-800 text-blue-400 hover:bg-blue-900/50'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800',
          ]"
        >
          <i :class="['mr-1', autoRefresh ? 'fa-solid fa-pause' : 'fa-solid fa-play']"></i>
          Auto {{ autoRefresh ? "On" : "Off" }}
        </button>
        <button @click="refresh" :disabled="!connected" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
          <i class="fa-solid fa-rotate-right"></i>
        </button>
        <input
          v-model="search"
          type="text"
          placeholder="Filter..."
          class="px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-700 w-48"
        />
        <span :class="['w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500']"></span>
        <button @click="reconnect" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors">
          <i class="fa-solid fa-link mr-1"></i>Connect
        </button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-400 mb-2">{{ error }}</p>

    <div class="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-lg">
      <div v-if="!connected" class="flex items-center justify-center h-full text-slate-500 text-sm">
        Not connected
      </div>
      <table v-else class="w-full text-sm">
        <thead class="sticky top-0 bg-slate-900 z-10">
          <tr class="text-left text-xs text-slate-400 border-b border-slate-800">
            <th
              class="px-3 py-2 cursor-pointer hover:text-slate-200 select-none transition-colors w-20"
              @click="toggleSort('pid')"
            >PID{{ sortIndicator("pid") }}</th>
            <th
              class="px-3 py-2 cursor-pointer hover:text-slate-200 select-none transition-colors"
              @click="toggleSort('name')"
            >Name{{ sortIndicator("name") }}</th>
            <th
              class="px-3 py-2 cursor-pointer hover:text-slate-200 select-none transition-colors w-32"
              @click="toggleSort('username')"
            >User{{ sortIndicator("username") }}</th>
            <th
              class="px-3 py-2 cursor-pointer hover:text-slate-200 select-none transition-colors w-20"
              @click="toggleSort('cpu')"
            >CPU%{{ sortIndicator("cpu") }}</th>
            <th
              class="px-3 py-2 cursor-pointer hover:text-slate-200 select-none transition-colors w-24"
              @click="toggleSort('memory')"
            >Memory{{ sortIndicator("memory") }}</th>
            <th class="px-3 py-2">Path</th>
            <th class="px-3 py-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="p in filteredProcesses"
            :key="p.pid"
            class="border-b border-slate-800/50 hover:bg-slate-800/50 transition-colors"
          >
            <td class="px-3 py-2 text-slate-400 font-mono text-xs">{{ p.pid }}</td>
            <td class="px-3 py-2 text-slate-200">{{ p.name }}</td>
            <td class="px-3 py-2 text-slate-400 text-xs">{{ p.username || "-" }}</td>
            <td :class="['px-3 py-2 font-mono text-xs', cpuColor(p.cpu || 0)]">{{ formatCpu(p.cpu) }}</td>
            <td :class="['px-3 py-2 font-mono text-xs', memColor(p.memory || 0)]">{{ formatMem(p.memory) }}</td>
            <td class="px-3 py-2 text-slate-500 text-xs max-w-xs truncate" :title="p.exePath">{{ p.exePath || "-" }}</td>
            <td class="px-3 py-2">
              <button
                @click="killProcess(p.pid)"
                :class="[
                  'text-xs rounded px-2 py-1 transition-colors',
                  killConfirmPid === p.pid
                    ? 'bg-red-900/40 border border-red-700 text-red-300 hover:bg-red-900/60'
                    : 'text-red-400 hover:text-red-300 hover:bg-red-900/20',
                ]"
              >
                <i :class="['mr-1', killConfirmPid === p.pid ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-xmark']"></i>
                {{ killConfirmPid === p.pid ? "Confirm" : "Kill" }}
              </button>
            </td>
          </tr>
          <tr v-if="filteredProcesses.length === 0 && connected">
            <td colspan="7" class="px-3 py-8 text-center text-slate-500 text-sm">
              <i class="fa-solid fa-magnifying-glass mr-2"></i>No processes found
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
