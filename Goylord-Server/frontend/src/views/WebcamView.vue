<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-3">
      <button
        class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        @click="$router.back()"
      >
        <i class="fas fa-arrow-left text-sm"></i>
      </button>
      <h1 class="text-base font-medium text-slate-100">Webcam</h1>
      <span class="ml-auto text-xs text-slate-500">{{ hostname }}</span>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-medium"
        :class="
          connected
            ? 'bg-emerald-900/40 text-emerald-400'
            : 'bg-red-900/40 text-red-400'
        "
      >
        {{ connected ? 'Connected' : 'Disconnected' }}
      </span>
    </header>

    <main class="mx-auto max-w-4xl space-y-6 p-6">
      <div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div class="flex flex-wrap items-center gap-4">
          <div class="flex-1">
            <label class="mb-1 block text-xs font-medium text-slate-400">Device</label>
            <select
              v-model="selectedDevice"
              :disabled="!devices.length || streaming"
              class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600 disabled:opacity-50"
            >
              <option v-if="!devices.length" value="">No devices available</option>
              <option v-for="d in devices" :key="d.index" :value="d.index">
                {{ d.name }} ({{ d.maxFps }} fps max)
              </option>
            </select>
          </div>
          <div class="pt-5">
            <button
              v-if="!streaming"
              :disabled="selectedDevice === null || !connected"
              class="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              @click="startStream"
            >
              Start
            </button>
            <button
              v-else
              class="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              @click="stopStream"
            >
              Stop
            </button>
          </div>
        </div>

        <div v-if="streaming" class="mt-3 flex gap-6 text-xs text-slate-400">
          <span>FPS: <span class="text-slate-200">{{ currentFps }}</span></span>
          <span>Resolution: <span class="text-slate-200">{{ resolution }}</span></span>
        </div>
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900">
        <canvas
          ref="videoCanvas"
          class="w-full bg-black"
          style="aspect-ratio: 16/9"
        ></canvas>
      </div>

      <div
        v-if="!devices.length && connected"
        class="rounded-lg border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-500"
      >
        No webcam devices detected
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const clientId = route.params.id
const hostname = ref('---')

const videoCanvas = ref(null)

const connected = ref(false)
const streaming = ref(false)
const devices = ref([])
const selectedDevice = ref(null)
const currentFps = ref('0')
const resolution = ref('---')

let ws = null
let frameCount = 0
let fpsInterval = null
let imageBitmap = null

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/clients/${clientId}/webcam/ws`)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    connected.value = true
    ws.send(JSON.stringify({ type: 'webcam_list' }))
  }

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      const msg = JSON.parse(ev.data)
      if (msg.type === 'webcam_devices') {
        devices.value = msg.devices || []
        if (msg.selected !== undefined && msg.selected !== null) {
          selectedDevice.value = msg.selected
        } else if (devices.value.length && selectedDevice.value === null) {
          selectedDevice.value = devices.value[0].index
        }
      }
    } else {
      renderFrame(ev.data)
    }
  }

  ws.onclose = () => {
    connected.value = false
    streaming.value = false
  }

  ws.onerror = () => {
    connected.value = false
  }
}

function renderFrame(buffer) {
  frameCount++
  const blob = new Blob([buffer], { type: 'image/jpeg' })
  const img = new Image()
  const url = URL.createObjectURL(blob)
  img.onload = () => {
    const canvas = videoCanvas.value
    if (canvas) {
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      resolution.value = `${img.naturalWidth}x${img.naturalHeight}`
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
    }
    URL.revokeObjectURL(url)
  }
  img.src = url
}

function startStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  if (selectedDevice.value !== null) {
    ws.send(JSON.stringify({ type: 'webcam_select', index: selectedDevice.value }))
  }
  ws.send(JSON.stringify({ type: 'webcam_start' }))
  streaming.value = true
  startFpsCounter()
}

function stopStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'webcam_stop' }))
  streaming.value = false
  stopFpsCounter()
  resolution.value = '---'
}

function startFpsCounter() {
  frameCount = 0
  fpsInterval = setInterval(() => {
    currentFps.value = String(frameCount)
    frameCount = 0
  }, 1000)
}

function stopFpsCounter() {
  clearInterval(fpsInterval)
  fpsInterval = null
  currentFps.value = '0'
}

function fetchHostname() {
  fetch(`/api/clients/${clientId}`, { credentials: 'include' })
    .then((r) => r.json())
    .then((d) => { hostname.value = d.nickname || d.host || d.id || '---' })
    .catch(() => {})
}

onMounted(() => {
  fetchHostname()
  connect()
})

onBeforeUnmount(() => {
  stopFpsCounter()
  if (ws) ws.close()
})
</script>
