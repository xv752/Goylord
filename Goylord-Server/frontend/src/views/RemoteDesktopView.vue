<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useWebSocket } from "@/composables/useWebSocket";
import AppSelect from "@/components/ui/AppSelect.vue";

const route = useRoute();
const router = useRouter();
const clientId = route.params.id as string;

const clientHost = ref("");
const clientOs = ref("");
const connected = ref(false);
const statusText = ref("Connecting...");
const canvasEl = ref<HTMLCanvasElement | null>(null);
const fps = ref(0);
const resolution = ref("");
const frameCount = ref(0);
const latency = ref(0);
const bandwidth = ref("");
const mouseEnabled = ref(true);
const keyboardEnabled = ref(true);
const qualityPct = ref(80);
const selectedDisplay = ref(0);
const displayOptions = ref<{ value: number; label: string }[]>([]);
const streaming = ref(false);
const fullscreen = ref(false);

const ws = useWebSocket();
let lastFrameTime = 0;
let fpsFrameCount = 0;
let fpsTimer: ReturnType<typeof setInterval> | null = null;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/clients/${encodeURIComponent(clientId)}/rd/ws`;
}

function handleMessage(msg: Record<string, unknown>) {
  if (msg.type === "ready") {
    connected.value = true;
    statusText.value = "Connected";
    streaming.value = true;
    clientHost.value = (msg.host as string) || "";
    clientOs.value = (msg.os as string) || "";
    ws.sendJson({ type: "desktop_start" });
  } else if (msg.type === "status") {
    const st = msg.status as string;
    statusText.value = st;
    if (st === "offline" || st === "stopped") {
      connected.value = false;
      streaming.value = false;
    }
  } else if (msg.type === "__frame__") {
    const data = msg.data as Uint8Array;
    renderFrame(data);
  } else if (msg.type === "desktop_stream_stats") {
    fps.value = msg.fps as number;
    resolution.value = `${msg.width}x${msg.height}`;
    if (msg.totalMs != null) latency.value = Math.round(msg.totalMs as number);
    if (msg.bytes != null) {
      const b = msg.bytes as number;
      bandwidth.value = b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1024).toFixed(0)} KB`;
    }
  } else if (msg.type === "desktop_displays") {
    const displays = msg.displays as Array<{ index: number; name?: string; width: number; height: number }>;
    if (displays?.length) {
      displayOptions.value = displays.map(d => ({ value: d.index, label: d.name || `Display ${d.index} (${d.width}x${d.height})` }));
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
      if (ctx) ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      frameCount.value++;
      fpsFrameCount++;
      const now = Date.now();
      if (lastFrameTime && now - lastFrameTime > 0) latency.value = Math.round(now - lastFrameTime);
      lastFrameTime = now;
    };
    img.src = url;
  }
}

function getCanvasCoords(e: MouseEvent) {
  const canvas = canvasEl.value;
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.round(((e.clientX - rect.left) / rect.width) * canvas.width),
    y: Math.round(((e.clientY - rect.top) / rect.height) * canvas.height),
  };
}

function sendMouseMove(e: MouseEvent) {
  if (!streaming.value || !mouseEnabled.value) return;
  const { x, y } = getCanvasCoords(e);
  ws.sendJson({ type: "mouse_move", x, y });
}

function sendMouseDown(e: MouseEvent) {
  if (!streaming.value || !mouseEnabled.value) return;
  const { x, y } = getCanvasCoords(e);
  ws.sendJson({ type: "mouse_down", button: e.button, x, y });
}

function sendMouseUp(e: MouseEvent) {
  if (!streaming.value || !mouseEnabled.value) return;
  const { x, y } = getCanvasCoords(e);
  ws.sendJson({ type: "mouse_up", button: e.button, x, y });
}

function sendWheel(e: WheelEvent) {
  e.preventDefault();
  if (!streaming.value || !mouseEnabled.value) return;
  const { x, y } = getCanvasCoords(e);
  ws.sendJson({ type: "mouse_wheel", delta: e.deltaY > 0 ? -3 : 3, x, y });
}

function sendKeyDown(e: KeyboardEvent) {
  if (!streaming.value || !keyboardEnabled.value) return;
  ws.sendJson({ type: "key_down", key: e.key, code: e.code });
  e.preventDefault();
}

function sendKeyUp(e: KeyboardEvent) {
  if (!streaming.value || !keyboardEnabled.value) return;
  ws.sendJson({ type: "key_up", key: e.key, code: e.code });
  e.preventDefault();
}

function sendQuality() {
  ws.sendJson({ type: "desktop_set_quality", quality: qualityPct.value, codec: "h264" });
}

function sendDisplay() {
  ws.sendJson({ type: "desktop_set_display", display: selectedDisplay.value });
}

function requestDisplays() {
  ws.sendJson({ type: "desktop_displays" });
}

function toggleFullscreen() {
  const el = canvasEl.value?.parentElement;
  if (!el) return;
  if (!document.fullscreenElement) {
    el.requestFullscreen();
    fullscreen.value = true;
  } else {
    document.exitFullscreen();
    fullscreen.value = false;
  }
}

function takeScreenshot() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `screenshot-${clientId}-${Date.now()}.png`; a.click();
    URL.revokeObjectURL(url);
  });
}

function stopStream() {
  ws.sendJson({ type: "desktop_stop" });
  streaming.value = false;
  statusText.value = "Stopped";
}

function startStream() {
  ws.sendJson({ type: "desktop_start" });
  streaming.value = true;
  statusText.value = "Starting...";
}

function reconnect() {
  fps.value = 0; resolution.value = ""; frameCount.value = 0;
  latency.value = 0; bandwidth.value = ""; lastFrameTime = 0; fpsFrameCount = 0;
  connected.value = false; streaming.value = false; statusText.value = "Connecting...";
  ws.disconnect();
  ws.connect(wsUrl(), handleMessage);
}

onMounted(() => {
  fpsTimer = setInterval(() => { fps.value = fpsFrameCount; fpsFrameCount = 0; }, 1000);
  ws.connect(wsUrl(), handleMessage);
});

onUnmounted(() => {
  if (streaming.value) ws.sendJson({ type: "desktop_stop" });
  ws.disconnect();
  if (fpsTimer) clearInterval(fpsTimer);
});
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 flex-shrink-0 flex-wrap" style="padding-bottom:8px;border-bottom:1px solid rgba(51,65,85,0.3);margin-bottom:8px">
      <button @click="router.back()" class="text-slate-400 hover:text-slate-200 transition-colors"><i class="fa-solid fa-arrow-left"></i></button>
      <h1 class="text-sm font-semibold text-slate-100">Remote Desktop</h1>
      <span v-if="clientHost" class="text-xs text-slate-400">{{ clientHost }}</span>
      <span :class="['text-xs px-2 py-0.5 rounded-full', connected ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500']">{{ statusText }}</span>

      <div class="ml-auto flex items-center gap-1.5">
        <!-- Mouse/Keyboard toggles -->
        <button @click="mouseEnabled = !mouseEnabled" :title="mouseEnabled ? 'Mouse ON' : 'Mouse OFF'" class="btn btn-xs" :class="mouseEnabled ? 'btn-primary' : ''">
          <i class="fa-solid fa-computer-mouse"></i>
        </button>
        <button @click="keyboardEnabled = !keyboardEnabled" :title="keyboardEnabled ? 'Keyboard ON' : 'Keyboard OFF'" class="btn btn-xs" :class="keyboardEnabled ? 'btn-primary' : ''">
          <i class="fa-solid fa-keyboard"></i>
        </button>

        <span style="width:1px;height:16px;background:rgba(51,65,85,0.5)"></span>

        <!-- Display selector -->
        <button v-if="displayOptions.length > 0" @click="requestDisplays" title="Refresh displays" class="btn btn-xs"><i class="fa-solid fa-display"></i></button>
        <AppSelect v-if="displayOptions.length > 0" v-model="selectedDisplay" :options="displayOptions" @update:modelValue="sendDisplay" style="width:100px" size="sm" />

        <!-- Quality slider -->
        <div class="flex items-center gap-1">
          <span class="text-xs text-slate-500">Q:</span>
          <input type="range" v-model.number="qualityPct" @change="sendQuality" min="10" max="100" step="5" class="quality-slider" />
          <span class="text-xs text-slate-400" style="width:28px;text-align:right">{{ qualityPct }}%</span>
        </div>

        <span style="width:1px;height:16px;background:rgba(51,65,85,0.5)"></span>

        <!-- Actions -->
        <button v-if="streaming" @click="stopStream" class="btn btn-xs btn-danger" title="Stop"><i class="fa-solid fa-stop"></i></button>
        <button v-else @click="startStream" class="btn btn-xs btn-success" title="Start"><i class="fa-solid fa-play"></i></button>
        <button @click="takeScreenshot" class="btn btn-xs" title="Screenshot"><i class="fa-solid fa-camera"></i></button>
        <button @click="toggleFullscreen" class="btn btn-xs" title="Fullscreen"><i :class="fullscreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand'"></i></button>
        <button @click="reconnect" class="btn btn-xs" title="Reconnect"><i class="fa-solid fa-rotate-right"></i></button>

        <span style="width:1px;height:16px;background:rgba(51,65,85,0.5)"></span>

        <!-- Stats -->
        <div class="flex items-center gap-2 text-xs text-slate-400">
          <span v-if="fps">{{ fps }} FPS</span>
          <span v-if="resolution">{{ resolution }}</span>
          <span v-if="latency">{{ latency }}ms</span>
          <span v-if="bandwidth">{{ bandwidth }}</span>
        </div>
      </div>
    </div>

    <!-- Canvas -->
    <div class="flex-1 bg-black border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center relative" style="min-height:0">
      <canvas
        ref="canvasEl"
        class="max-w-full max-h-full outline-none"
        :class="mouseEnabled ? 'cursor-crosshair' : 'cursor-default'"
        tabindex="0"
        @mousemove="sendMouseMove"
        @mousedown.prevent="sendMouseDown"
        @mouseup.prevent="sendMouseUp"
        @wheel.prevent="sendWheel"
        @keydown="sendKeyDown"
        @keyup="sendKeyUp"
        @contextmenu.prevent
      ></canvas>
      <div v-if="!connected" class="absolute inset-0 flex items-center justify-center">
        <div class="text-center">
          <i class="fa-solid fa-desktop text-4xl text-slate-700 mb-3"></i>
          <p class="text-sm text-slate-500">{{ statusText }}</p>
          <button v-if="!connected" @click="reconnect" class="btn btn-primary btn-sm" style="margin-top:12px"><i class="fa-solid fa-rotate-right" style="margin-right:6px"></i>Connect</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quality-slider { -webkit-appearance: none; appearance: none; width: 60px; height: 4px; background: #1e293b; border-radius: 2px; outline: none; cursor: pointer; }
.quality-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; background: #6366f1; border-radius: 50%; cursor: pointer; }
.quality-slider::-moz-range-thumb { width: 12px; height: 12px; background: #6366f1; border-radius: 50%; border: none; cursor: pointer; }
</style>
