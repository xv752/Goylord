<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-3">
      <button
        class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        @click="$router.back()"
      >
        <i class="fas fa-arrow-left text-sm"></i>
      </button>
      <h1 class="text-base font-medium text-slate-100">Voice</h1>
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
            <label class="mb-1 block text-xs font-medium text-slate-400">Source</label>
            <select
              v-model="source"
              :disabled="streaming"
              class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600 disabled:opacity-50"
            >
              <option value="mic">Microphone</option>
              <option value="desktop">Desktop Audio</option>
            </select>
          </div>
          <div class="pt-5">
            <button
              v-if="!streaming"
              :disabled="!connected"
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
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <label class="mb-2 block text-xs font-medium text-slate-400">Visualization</label>
        <canvas
          ref="vizCanvas"
          class="w-full rounded bg-black"
          style="height: 120px"
        ></canvas>
      </div>

      <div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <label class="mb-2 block text-xs font-medium text-slate-400">Volume</label>
        <div class="h-3 w-full overflow-hidden rounded bg-slate-800">
          <div
            class="h-full transition-all duration-100"
            :class="volumeColor"
            :style="{ width: volumePercent + '%' }"
          ></div>
        </div>
        <div class="mt-1 text-right text-xs text-slate-500">{{ volumePercent }}%</div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const clientId = route.params.id
const hostname = ref('---')

const vizCanvas = ref(null)

const connected = ref(false)
const streaming = ref(false)
const source = ref('mic')
const volumePercent = ref(0)

let ws = null
let audioCtx = null
let analyser = null
let animFrame = null

const volumeColor = computed(() => {
  const v = volumePercent.value
  if (v > 80) return 'bg-red-500'
  if (v > 50) return 'bg-amber-500'
  return 'bg-emerald-500'
})

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/api/clients/${clientId}/voice/ws`)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    connected.value = true
  }

  ws.onmessage = (ev) => {
    if (ev.data instanceof ArrayBuffer) {
      processAudioFrame(ev.data)
    }
  }

  ws.onclose = () => {
    connected.value = false
    streaming.value = false
    stopVisualization()
  }

  ws.onerror = () => {
    connected.value = false
  }
}

function processAudioFrame(buffer) {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (!analyser) {
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8
    startVisualization()
  }

  audioCtx.decodeAudioData(buffer.slice(0)).then((decoded) => {
    const sourceNode = audioCtx.createBufferSource()
    sourceNode.buffer = decoded
    sourceNode.connect(analyser)
    analyser.connect(audioCtx.destination)
    sourceNode.start(0)
  }).catch(() => {})
}

function startVisualization() {
  const canvas = vizCanvas.value
  if (!canvas || !analyser) return
  const ctx = canvas.getContext('2d')
  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  function draw() {
    animFrame = requestAnimationFrame(draw)
    analyser.getByteFrequencyData(dataArray)

    let sum = 0
    for (let i = 0; i < bufferLength; i++) sum += dataArray[i]
    volumePercent.value = Math.round((sum / bufferLength / 255) * 100)

    canvas.width = canvas.offsetWidth
    canvas.height = canvas.offsetHeight
    const barWidth = canvas.width / bufferLength

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height
      const x = i * barWidth
      ctx.fillStyle = 'rgb(51, 65, 85)'
      ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight)
    }
  }

  draw()
}

function stopVisualization() {
  if (animFrame) {
    cancelAnimationFrame(animFrame)
    animFrame = null
  }
  analyser = null
  volumePercent.value = 0
}

function startStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'start', source: source.value }))
  streaming.value = true
}

function stopStream() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return
  ws.send(JSON.stringify({ type: 'stop' }))
  streaming.value = false
  stopVisualization()
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
  stopVisualization()
  if (audioCtx) {
    audioCtx.close().catch(() => {})
    audioCtx = null
  }
  if (ws) ws.close()
})
</script>
