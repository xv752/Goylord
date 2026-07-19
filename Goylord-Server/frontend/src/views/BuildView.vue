<template>
  <div class="min-h-screen bg-slate-950 text-slate-100">
    <header class="flex items-center gap-4 border-b border-slate-800 bg-slate-900 px-6 py-3">
      <button
        class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        @click="$router.back()"
      >
        <i class="fas fa-arrow-left text-sm"></i>
      </button>
      <h1 class="text-base font-medium text-slate-100">Build</h1>
    </header>

    <main class="mx-auto max-w-6xl space-y-6 p-6">
      <div class="grid gap-6 lg:grid-cols-2">
        <div class="space-y-6">
          <section class="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 class="mb-4 text-sm font-medium text-slate-300">Build Configuration</h2>
            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Platform</label>
                  <select
                    v-model="form.platform"
                    class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                  >
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                  </select>
                </div>
                <div>
                  <label class="mb-1 block text-xs font-medium text-slate-400">Architecture</label>
                  <select
                    v-model="form.arch"
                    class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                  >
                    <option value="amd64">amd64</option>
                    <option value="arm64">arm64</option>
                  </select>
                </div>
              </div>

              <div class="flex items-center gap-3">
                <button
                  type="button"
                  class="relative h-5 w-9 rounded-full transition-colors"
                  :class="form.obfuscation ? 'bg-blue-600' : 'bg-slate-700'"
                  @click="form.obfuscation = !form.obfuscation"
                >
                  <span
                    class="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
                    :class="form.obfuscation ? 'translate-x-4' : 'translate-x-0.5'"
                  ></span>
                </button>
                <label class="text-sm text-slate-300">Obfuscation</label>
              </div>

              <div
                v-for="(val, key) in form.settings"
                :key="key"
              >
                <label class="mb-1 block text-xs font-medium text-slate-400">{{ key }}</label>
                <input
                  :value="val"
                  class="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-slate-600"
                  @input="form.settings[key] = $event.target.value"
                />
              </div>

              <button
                :disabled="building || !connected"
                class="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                @click="startBuild"
              >
                <i v-if="building" class="fas fa-spinner fa-spin mr-2"></i>
                {{ building ? 'Building...' : 'Start Build' }}
              </button>
            </div>
          </section>

          <section v-if="plugins.length" class="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 class="mb-4 text-sm font-medium text-slate-300">Build Plugins</h2>
            <div class="space-y-4">
              <div
                v-for="p in plugins"
                :key="p.id"
                class="rounded border border-slate-700/50 bg-slate-800/50 p-3"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm text-slate-200">{{ p.name }}</span>
                  <span class="text-xs text-slate-500">v{{ p.version }}</span>
                  <span
                    class="ml-auto rounded-full px-1.5 py-0.5 text-xs"
                    :class="p.enabled ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-700 text-slate-500'"
                  >
                    {{ p.enabled ? 'Active' : 'Disabled' }}
                  </span>
                </div>
                <div v-if="p.settings && Object.keys(p.settings).length" class="mt-2 space-y-2">
                  <div
                    v-for="(val, key) in p.settings"
                    :key="key"
                  >
                    <label class="mb-0.5 block text-xs text-slate-400">{{ key }}</label>
                    <input
                      :value="val"
                      class="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 outline-none focus:border-slate-600"
                      @input="p.settings[key] = $event.target.value"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div class="space-y-6">
          <section class="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 class="mb-4 text-sm font-medium text-slate-300">Build Output</h2>
            <div
              ref="outputEl"
              class="h-80 overflow-y-auto rounded bg-black p-3 font-mono text-xs text-slate-400"
            >
              <div v-if="!buildLogs.length" class="text-slate-600">No build output yet.</div>
              <div v-for="(line, i) in buildLogs" :key="i" class="whitespace-pre-wrap">{{ line }}</div>
            </div>
          </section>

          <section class="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <h2 class="mb-4 text-sm font-medium text-slate-300">Build History</h2>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs">
                <thead>
                  <tr class="border-b border-slate-800 text-slate-500">
                    <th class="pb-2 font-medium">ID</th>
                    <th class="pb-2 font-medium">Platform</th>
                    <th class="pb-2 font-medium">Status</th>
                    <th class="pb-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="b in builds"
                    :key="b.id"
                    class="border-b border-slate-800/50"
                  >
                    <td class="py-2 text-slate-400">{{ b.id }}</td>
                    <td class="py-2 text-slate-300">{{ b.platform }}</td>
                    <td class="py-2">
                      <span
                        class="rounded-full px-1.5 py-0.5 text-xs font-medium"
                        :class="buildStatusClass(b.status)"
                      >
                        {{ b.status }}
                      </span>
                    </td>
                    <td class="py-2 text-slate-500">{{ formatDate(b.createdAt) }}</td>
                  </tr>
                  <tr v-if="!builds.length">
                    <td colspan="4" class="py-4 text-center text-slate-600">No builds yet</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'

const connected = ref(true)
const building = ref(false)
const buildLogs = ref([])
const builds = ref([])
const plugins = ref([])
const outputEl = ref(null)

const form = reactive({
  platform: 'windows',
  arch: 'amd64',
  obfuscation: false,
  settings: {},
})

let pollInterval = null

function buildStatusClass(status) {
  switch (status) {
    case 'success':
    case 'completed':
      return 'bg-emerald-900/40 text-emerald-400'
    case 'building':
    case 'running':
    case 'pending':
      return 'bg-blue-900/40 text-blue-400'
    case 'failed':
    case 'error':
      return 'bg-red-900/40 text-red-400'
    default:
      return 'bg-slate-700 text-slate-400'
  }
}

function formatDate(d) {
  if (!d) return '---'
  return new Date(d).toLocaleString()
}

function scrollToBottom() {
  nextTick(() => {
    const el = outputEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function startBuild() {
  building.value = true
  buildLogs.value = ['Starting build...']
  scrollToBottom()

  const payload = {
    platform: form.platform,
    arch: form.arch,
    settings: {
      ...form.settings,
      obfuscation: form.obfuscation,
    },
  }

  try {
    const res = await fetch('/api/build/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) {
      buildLogs.value.push(`Error: ${data.error || 'Build request failed'}`)
      building.value = false
      return
    }
    buildLogs.value.push(`Build started: ${data.id || 'unknown'}`)
    scrollToBottom()
    startPolling(data.id)
  } catch (err) {
    buildLogs.value.push(`Network error: ${err.message}`)
    building.value = false
  }
}

function startPolling(buildId) {
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/builds', { credentials: 'include' })
      const list = await res.json()
      builds.value = (list || []).slice(0, 20)

      if (buildId) {
        const current = builds.value.find((b) => b.id === buildId)
        if (current && current.status !== 'building' && current.status !== 'running' && current.status !== 'pending') {
          building.value = false
          buildLogs.value.push(`Build finished: ${current.status}`)
          scrollToBottom()
          clearInterval(pollInterval)
          pollInterval = null
        }
      }
    } catch { /* silent */ }
  }, 3000)
}

async function fetchBuilds() {
  try {
    const res = await fetch('/api/builds', { credentials: 'include' })
    builds.value = (await res.json() || []).slice(0, 20)
  } catch { /* silent */ }
}

async function fetchPlugins() {
  try {
    const res = await fetch('/api/build/plugins', { credentials: 'include' })
    const list = await res.json() || []
    plugins.value = list.map((p) => ({
      ...p,
      settings: p.settings || {},
    }))
  } catch { /* silent */ }
}

onMounted(() => {
  fetchBuilds()
  fetchPlugins()
})

onBeforeUnmount(() => {
  if (pollInterval) clearInterval(pollInterval)
})
</script>
