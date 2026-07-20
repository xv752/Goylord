<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWebSocket } from "@/composables/useWebSocket";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const clientHost = ref("");
const clientUser = ref("");
const clientOs = ref("");
const connected = ref(false);
const statusText = ref("Connecting...");
const statusTone = ref("pill-ghost");

const termContainer = ref<HTMLDivElement | null>(null);

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let sessionClosed = false;
let offlineNotified = false;
let lastSize = { cols: 0, rows: 0 };
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let alive = true;

const ws = useWebSocket();

const THEME = {
  background: "#050913",
  foreground: "#e8edf2",
  cursor: "#6ee7b7",
  cursorAccent: "#050913",
  selectionBackground: "rgba(110, 231, 183, 0.25)",
  black: "#1a1d29",
  red: "#ef4444",
  green: "#22c55e",
  yellow: "#eab308",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e8edf2",
  brightBlack: "#475569",
  brightRed: "#f87171",
  brightGreen: "#4ade80",
  brightYellow: "#facc15",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#f8fafc",
};

function isWindowsOs(os: string) {
  return /win/i.test(os);
}

function setStatus(label: string, tone: string) {
  statusText.value = label;
  statusTone.value = tone;
}

function initTerminal(os: string) {
  if (term) return;
  const opts: ConstructorParameters<typeof Terminal>[0] = {
    cursorBlink: true,
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
    fontSize: 13,
    scrollback: 10000,
    allowProposedApi: true,
    theme: THEME,
  };
  if (isWindowsOs(os)) {
    (opts as any).windowsPty = { backend: "conpty", buildNumber: 22621 };
  }

  term = new Terminal(opts);
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  if (termContainer.value) {
    term.open(termContainer.value);
  }

  term.onData((d) => {
    if (sessionClosed) return;
    ws.sendJson({ type: "input", data: d });
  });

  term.onResize(() => {
    sendResize();
  });

  nextTick(() => tryFit());
}

function tryFit() {
  if (!fitAddon) return;
  try {
    fitAddon.fit();
  } catch {
    /* ignore: container not yet measured */
  }
}

function sendResize() {
  if (sessionClosed) return;
  if (!term) return;
  const cols = term.cols;
  const rows = term.rows;
  if (!cols || !rows) return;
  if (cols === lastSize.cols && rows === lastSize.rows) return;
  lastSize = { cols, rows };
  ws.sendJson({ type: "resize", cols, rows });
}

function applyOutput(data: unknown) {
  if (!data || !term) return;
  if (data instanceof Uint8Array) {
    term.write(data);
  } else if (typeof data === "string") {
    term.write(data);
  } else if ((data as any)?.buffer instanceof ArrayBuffer) {
    const buf = data as { buffer: ArrayBuffer; byteOffset?: number; byteLength?: number };
    term.write(new Uint8Array(buf.buffer, buf.byteOffset ?? 0, buf.byteLength));
  }
}

function writeSystem(msg: string) {
  const line = `\x1b[2m[${msg}]\x1b[0m`;
  if (term) {
    term.writeln(line);
  }
}

function handleMessage(msg: Record<string, unknown>) {
  switch (msg.type) {
    case "ready":
      connected.value = true;
      clientHost.value = (msg.host as string) || "";
      clientUser.value = (msg.user as string) || "";
      clientOs.value = (msg.os as string) || "";
      initTerminal((msg.os as string) || "");
      if (term) term.options.disableStdin = false;
      tryFit();
      sendResize();
      setStatus("Live", "pill-online");
      break;
    case "status": {
      const st = msg.status as string;
      if (st === "offline") {
        setStatus("Offline", "pill-offline");
        if (!offlineNotified) {
          offlineNotified = true;
          writeSystem((msg.reason as string) || "Client offline");
        }
        sessionClosed = true;
        if (term) term.options.disableStdin = true;
      } else if (st === "closed") {
        setStatus("Closed", "pill-offline");
        writeSystem((msg.reason as string) || "Console closed");
        sessionClosed = true;
        if (term) term.options.disableStdin = true;
      } else if (st === "online") {
        offlineNotified = false;
      }
      break;
    }
    case "output":
      applyOutput(msg.data);
      if (msg.error) writeSystem(msg.error as string);
      if (typeof msg.exitCode === "number") {
        if (term) term.writeln(`\r\n\x1b[33m[Process exited (${msg.exitCode})]\x1b[0m`);
        setStatus("Closed", "pill-offline");
        sessionClosed = true;
        if (term) term.options.disableStdin = true;
      }
      break;
  }
}

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${encodeURIComponent(clientId)}/console/ws`;
}

function connect() {
  sessionClosed = false;
  offlineNotified = false;
  lastSize = { cols: 0, rows: 0 };
  setStatus("Connecting...", "pill-ghost");
  ws.connect(wsUrl(), handleMessage);
}

function reconnect() {
  try { ws.disconnect(); } catch { /* ignore */ }
  if (term) term.reset();
  lastSize = { cols: 0, rows: 0 };
  connect();
}

function onWindowResize() {
  if (!alive) return;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(tryFit, 120);
}

function onPageHide() {
  alive = false;
  if (resizeTimer) clearTimeout(resizeTimer);
  try { ws.disconnect(); } catch { /* ignore */ }
  try { term?.dispose(); } catch { /* ignore */ }
  term = null;
  fitAddon = null;
}

onMounted(() => {
  connect();
  window.addEventListener("resize", onWindowResize);
  window.addEventListener("pagehide", onPageHide);
});

onUnmounted(() => {
  alive = false;
  if (resizeTimer) clearTimeout(resizeTimer);
  window.removeEventListener("resize", onWindowResize);
  window.removeEventListener("pagehide", onPageHide);
  try { ws.disconnect(); } catch { /* ignore */ }
  try { term?.dispose(); } catch { /* ignore */ }
  term = null;
  fitAddon = null;
});
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center gap-3 flex-shrink-0">
      <button
        @click="router.back()"
        class="text-slate-400 hover:text-slate-200 transition-colors"
      >
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <h1 class="text-lg font-semibold text-slate-100">Console</h1>
      <span v-if="clientHost" class="text-sm text-slate-400">{{ clientHost }}</span>
      <span v-if="clientUser" class="text-xs text-slate-600">{{ clientUser }}</span>
      <div class="ml-auto flex items-center gap-2">
        <span
          :class="[
            'w-2 h-2 rounded-full',
            connected ? 'bg-green-500' : 'bg-red-500',
          ]"
        ></span>
        <span class="text-xs text-slate-400">{{ statusText }}</span>
        <button
          @click="reconnect"
          class="px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <i class="fa-solid fa-rotate-right mr-1"></i>Reconnect
        </button>
      </div>
    </div>

    <div
      class="flex-1 mt-3 border border-slate-800 rounded-lg overflow-hidden"
      style="background: #050913"
    >
      <div ref="termContainer" class="w-full h-full"></div>
    </div>
  </div>
</template>
