<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
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
const canvasEl = ref<HTMLCanvasElement | null>(null);
const quality = ref("balanced");
const fps = ref(0);
const resolution = ref("");
const frameCount = ref(0);
const latency = ref(0);
const bandwidth = ref("");

const ws = useWebSocket();
let lastFrameTime = 0;
let fpsFrameCount = 0;
let fpsTimer: ReturnType<typeof setInterval> | null = null;
let streamActive = false;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${clientId}/rd/ws`;
}

function handleMessage(msg: Record<string, unknown>) {
  if (msg.type === "ready") {
    connected.value = true;
    statusText.value = "Connected";
    streamActive = true;
    ws.sendJson({ type: "desktop_start" });
  } else if (msg.type === "status") {
    const st = msg.status as string;
    statusText.value = st;
    if (st === "offline" || st === "stopped") {
      connected.value = false;
      streamActive = false;
    }
  } else if (msg.type === "__frame__") {
    const data = msg.data as Uint8Array;
    renderFrame(data);
  } else if (msg.type === "desktop_stream_stats") {
    fps.value = msg.fps as number;
    resolution.value = `${msg.width}x${msg.height}`;
    if (msg.totalMs != null) {
      latency.value = Math.round(msg.totalMs as number);
    }
    if (msg.bytes != null) {
      const b = msg.bytes as number;
      if (b > 1048576) {
        bandwidth.value = `${(b / 1048576).toFixed(1)} MB`;
      } else {
        bandwidth.value = `${(b / 1024).toFixed(0)} KB`;
      }
    }
  }
}

function renderFrame(data: Uint8Array) {
  const canvas = canvasEl.value;
  if (!canvas || data.length < 9) return;

  const format = data[6];
  if (format === 1 || format === 0) {
    const jpegBytes = data.slice(8);
    const blob = new Blob([jpegBytes], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
      }
      URL.revokeObjectURL(url);
      frameCount.value++;
      fpsFrameCount++;
      const now = Date.now();
      if (lastFrameTime && now - lastFrameTime > 0) {
        const ms = now - lastFrameTime;
        latency.value = Math.round(ms);
      }
      lastFrameTime = now;
    };
    img.src = url;
  }
}

function sendMouseMove(e: MouseEvent) {
  if (!streamActive) return;
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
  ws.sendJson({ type: "mouse_move", x, y });
}

function sendMouseDown(e: MouseEvent) {
  if (!streamActive) return;
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
  ws.sendJson({ type: "mouse_down", button: e.button, x, y });
}

function sendMouseUp(e: MouseEvent) {
  if (!streamActive) return;
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
  ws.sendJson({ type: "mouse_up", button: e.button, x, y });
}

function sendWheel(e: WheelEvent) {
  e.preventDefault();
  if (!streamActive) return;
  const canvas = canvasEl.value;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.round(((e.clientX - rect.left) / rect.width) * canvas.width);
  const y = Math.round(((e.clientY - rect.top) / rect.height) * canvas.height);
  const delta = e.deltaY > 0 ? -3 : 3;
  ws.sendJson({ type: "mouse_wheel", delta, x, y });
}

function sendKeyDown(e: KeyboardEvent) {
  if (!streamActive) return;
  ws.sendJson({ type: "key_down", key: e.key, code: e.code });
  e.preventDefault();
}

function sendKeyUp(e: KeyboardEvent) {
  if (!streamActive) return;
  ws.sendJson({ type: "key_up", key: e.key, code: e.code });
  e.preventDefault();
}

function setQuality(q: string) {
  quality.value = q;
  ws.sendJson({
    type: "desktop_set_quality",
    quality: q,
    codec: "h264",
  });
}

function reconnect() {
  fps.value = 0;
  resolution.value = "";
  frameCount.value = 0;
  latency.value = 0;
  bandwidth.value = "";
  lastFrameTime = 0;
  fpsFrameCount = 0;
  connected.value = false;
  statusText.value = "Connecting...";
  streamActive = false;
  ws.disconnect();
  ws.connect(wsUrl(), handleMessage);
}

onMounted(async () => {
  try {
    client.value = await clientApi.get(clientId);
  } catch {
    /* silent */
  }

  fpsTimer = setInterval(() => {
    fps.value = fpsFrameCount;
    fpsFrameCount = 0;
  }, 1000);

  ws.connect(wsUrl(), handleMessage);
});

onUnmounted(() => {
  if (streamActive) {
    ws.sendJson({ type: "desktop_stop" });
  }
  ws.disconnect();
  if (fpsTimer) clearInterval(fpsTimer);
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
        <h1 class="text-lg font-semibold text-slate-100">Remote Desktop</h1>
        <span class="text-sm text-slate-400">{{ client.nickname || client.host }}</span>
        <span class="text-xs text-slate-600">{{ client.user }}</span>
      </template>
      <span
        :class="[
          'text-xs px-2 py-0.5 rounded-full',
          connected ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500',
        ]"
      >
        {{ statusText }}
      </span>
      <div class="ml-auto flex items-center gap-2">
        <div class="flex gap-1">
          <button
            v-for="q in ['balanced', 'high', 'ultra']"
            :key="q"
            @click="setQuality(q)"
            class="text-xs px-2 py-1 rounded transition-colors"
            :class="
              quality === q
                ? 'bg-slate-700 text-slate-200'
                : 'bg-slate-900 border border-slate-800 text-slate-500 hover:text-slate-300 hover:bg-slate-800'
            "
          >
            {{ q }}
          </button>
        </div>
        <div class="flex items-center gap-3 text-xs text-slate-400">
          <span v-if="fps">{{ fps }} FPS</span>
          <span v-if="resolution">{{ resolution }}</span>
          <span v-if="latency">{{ latency }}ms</span>
          <span v-if="bandwidth">{{ bandwidth }}</span>
          <span>{{ frameCount }} frames</span>
        </div>
        <button
          @click="reconnect"
          class="px-2.5 py-1 text-xs rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 transition-colors"
        >
          <i class="fa-solid fa-rotate-right"></i>
        </button>
      </div>
    </div>

    <div class="flex-1 mt-3 bg-black border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center relative">
      <canvas
        ref="canvasEl"
        class="max-w-full max-h-full cursor-crosshair outline-none"
        tabindex="0"
        @mousemove="sendMouseMove"
        @mousedown.prevent="sendMouseDown"
        @mouseup.prevent="sendMouseUp"
        @wheel.prevent="sendWheel"
        @keydown="sendKeyDown"
        @keyup="sendKeyUp"
        @contextmenu.prevent
      ></canvas>
      <div
        v-if="!connected"
        class="absolute inset-0 flex items-center justify-center"
      >
        <div class="text-center">
          <i class="fa-solid fa-desktop text-4xl text-slate-700 mb-3"></i>
          <p class="text-sm text-slate-500">{{ statusText }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
