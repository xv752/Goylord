<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { clientApi } from "@/api/client";
import { useWebSocket } from "@/composables/useWebSocket";
import type { Client } from "@/api/types";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const client = ref<Client | null>(null);
const connected = ref(false);
const statusText = ref("Connecting...");
const inputEl = ref<HTMLTextAreaElement | null>(null);
const termEl = ref<HTMLPreElement | null>(null);
const output = ref("");
const sessionId = ref("");
const charCount = computed(() => output.value.length);

const ws = useWebSocket();

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${clientId}/console/ws`;
}

function handleMessage(msg: Record<string, unknown>) {
  if (msg.type === "ready") {
    connected.value = true;
    statusText.value = "Connected";
    sessionId.value = (msg.sessionId as string) || "";
    ws.sendJson({ type: "console_start" });
    sendResize();
  } else if (msg.type === "status") {
    const st = msg.status as string;
    if (st === "offline" || st === "stopped") {
      connected.value = false;
      statusText.value = st === "offline" ? "Client offline" : "Stopped";
    } else {
      statusText.value = st;
    }
  } else if (msg.type === "console_output") {
    const data = msg.data as string;
    if (data) {
      output.value += data;
      if (output.value.length > 80000) {
        output.value = output.value.slice(-60000);
      }
      nextTick(() => {
        if (termEl.value) {
          termEl.value.scrollTop = termEl.value.scrollHeight;
        }
      });
    }
  }
}

function sendResize() {
  const el = termEl.value;
  if (!el) return;
  const chars = el.clientWidth / 7.2;
  const rows = el.clientHeight / 14;
  if (chars > 0 && rows > 0) {
    ws.sendJson({
      type: "console_resize",
      cols: Math.max(20, Math.floor(chars)),
      rows: Math.max(5, Math.floor(rows)),
    });
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!connected.value) return;

  if (e.ctrlKey && e.key === "c") {
    ws.sendJson({ type: "console_input", data: "\x03" });
    e.preventDefault();
    return;
  }
  if (e.ctrlKey && e.key === "l") {
    output.value = "";
    e.preventDefault();
    return;
  }
  if (e.ctrlKey && e.key === "z") {
    ws.sendJson({ type: "console_input", data: "\x1A" });
    e.preventDefault();
    return;
  }
  if (e.key === "Enter") {
    ws.sendJson({ type: "console_input", data: "\r" });
    e.preventDefault();
    return;
  }
  if (e.key === "Backspace") {
    ws.sendJson({ type: "console_input", data: "\x7F" });
    e.preventDefault();
    return;
  }
  if (e.key === "Tab") {
    ws.sendJson({ type: "console_input", data: "\t" });
    e.preventDefault();
    return;
  }
  if (e.key === "Escape") {
    ws.sendJson({ type: "console_input", data: "\x1B" });
    e.preventDefault();
    return;
  }
  if (e.key === "ArrowUp") {
    ws.sendJson({ type: "console_input", data: "\x1B[A" });
    e.preventDefault();
    return;
  }
  if (e.key === "ArrowDown") {
    ws.sendJson({ type: "console_input", data: "\x1B[B" });
    e.preventDefault();
    return;
  }
  if (e.key === "ArrowLeft") {
    ws.sendJson({ type: "console_input", data: "\x1B[D" });
    e.preventDefault();
    return;
  }
  if (e.key === "ArrowRight") {
    ws.sendJson({ type: "console_input", data: "\x1B[C" });
    e.preventDefault();
    return;
  }
  if (e.key === "Home") {
    ws.sendJson({ type: "console_input", data: "\x1B[H" });
    e.preventDefault();
    return;
  }
  if (e.key === "End") {
    ws.sendJson({ type: "console_input", data: "\x1B[F" });
    e.preventDefault();
    return;
  }
  if (e.key === "Delete") {
    ws.sendJson({ type: "console_input", data: "\x1B[3~" });
    e.preventDefault();
    return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
    ws.sendJson({ type: "console_input", data: e.key });
    e.preventDefault();
  }
}

function reconnect() {
  output.value = "";
  connected.value = false;
  statusText.value = "Connecting...";
  ws.disconnect();
  ws.connect(wsUrl(), handleMessage);
}

let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObs: ResizeObserver | null = null;

onMounted(async () => {
  try {
    client.value = await clientApi.get(clientId);
  } catch {
    /* silent */
  }
  ws.connect(wsUrl(), handleMessage);

  if (termEl.value) {
    resizeObs = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendResize, 150);
    });
    resizeObs.observe(termEl.value);
  }
});

onUnmounted(() => {
  ws.disconnect();
  if (resizeObs) resizeObs.disconnect();
  if (resizeTimer) clearTimeout(resizeTimer);
});
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center gap-3 flex-shrink-0">
      <button @click="router.back()" class="text-slate-400 hover:text-slate-200 transition-colors">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      <div v-if="!client" class="text-sm text-slate-400">Loading...</div>
      <template v-else>
        <h1 class="text-lg font-semibold text-slate-100">Console</h1>
        <span class="text-sm text-slate-400">{{ client.nickname || client.host }}</span>
        <span class="text-xs text-slate-600">{{ client.user }}</span>
      </template>
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
      class="flex-1 mt-3 bg-black border border-slate-800 rounded-lg overflow-hidden flex flex-col"
    >
      <pre
        ref="termEl"
        class="flex-1 overflow-auto p-3 font-mono text-xs text-green-400 whitespace-pre-wrap break-all leading-5 select-text"
        @click="inputEl?.focus()"
      >{{ output }}<span class="animate-pulse text-green-400">&#9608;</span></pre>
      <textarea
        ref="inputEl"
        class="absolute opacity-0 w-0 h-0 pointer-events-none"
        @keydown="onKeydown"
        autofocus
      ></textarea>
    </div>

    <div class="flex items-center gap-2 mt-2 flex-shrink-0">
      <span class="text-xs text-slate-500">Terminal</span>
      <span class="text-xs text-slate-700">|</span>
      <span class="text-xs text-slate-500">{{ charCount }} chars</span>
      <span v-if="sessionId" class="text-xs text-slate-700">|</span>
      <span v-if="sessionId" class="text-xs text-slate-600">{{ sessionId }}</span>
      <div class="ml-auto text-xs text-slate-600">
        Ctrl+C interrupt, Ctrl+L clear, arrow keys supported
      </div>
    </div>
  </div>
</template>
