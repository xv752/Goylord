<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface Proxy {
  id: number
  clientId: string
  hostname: string
  port: number
  status: string
}

interface Client {
  id: string
  host: string
  nickname?: string
  online: boolean
}

const proxies = ref<Proxy[]>([])
const clients = ref<Client[]>([])
const loading = ref(true)
const showModal = ref(false)
const stopping = ref<number | null>(null)
const creating = ref(false)
const error = ref('')
const success = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

const newProxy = ref({ clientId: '', port: 1080 })

async function loadProxies() {
  try {
    proxies.value = await api.get<Proxy[]>('/api/socks5/proxies')
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {
    // silent
  }
}

async function createProxy() {
  if (!newProxy.value.clientId) return
  creating.value = true
  error.value = ''
  try {
    await api.post('/api/socks5/proxies', newProxy.value)
    success.value = 'Proxy created'
    showModal.value = false
    newProxy.value = { clientId: '', port: 1080 }
    await loadProxies()
  } catch (e: any) {
    error.value = e.message || 'Failed to create proxy'
  } finally {
    creating.value = false
  }
}

async function stopProxy(id: number) {
  stopping.value = id
  error.value = ''
  try {
    await api.post(`/api/socks5/proxies/${id}/stop`)
    await loadProxies()
  } catch (e: any) {
    error.value = e.message || 'Failed to stop proxy'
  } finally {
    stopping.value = null
  }
}

function openModal() {
  loadClients()
  showModal.value = true
}

function statusColor(status: string) {
  if (status === 'active' || status === 'running') return 'text-green-400'
  if (status === 'error' || status === 'failed') return 'text-red-400'
  return 'text-slate-500'
}

onMounted(() => {
  loadProxies()
  refreshTimer = setInterval(loadProxies, 5000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <h1 class="text-xl font-semibold text-slate-100">SOCKS5 Proxies</h1>
          <span class="text-xs text-slate-500">Auto-refresh 5s</span>
        </div>
        <div class="flex gap-2">
          <button @click="loadProxies" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded border border-slate-700">
            <i class="fas fa-sync-alt"></i>
          </button>
          <button @click="openModal" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded">
            <i class="fas fa-plus mr-1.5"></i>New Proxy
          </button>
        </div>
      </div>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-800 text-left text-slate-400">
              <th class="px-4 py-2.5 font-medium">Client</th>
              <th class="px-4 py-2.5 font-medium">Port</th>
              <th class="px-4 py-2.5 font-medium">Status</th>
              <th class="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">
                <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
              </td>
            </tr>
            <tr v-else-if="proxies.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">
                No active proxies
              </td>
            </tr>
            <tr
              v-for="proxy in proxies"
              :key="proxy.id"
              class="border-b border-slate-800/50"
            >
              <td class="px-4 py-2.5 text-slate-200">{{ proxy.hostname }}</td>
              <td class="px-4 py-2.5 text-slate-400 font-mono">{{ proxy.port }}</td>
              <td class="px-4 py-2.5">
                <span :class="[statusColor(proxy.status), 'text-xs']">
                  <i class="fas fa-circle text-[6px] mr-1"></i>
                  {{ proxy.status }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <button
                  @click="stopProxy(proxy.id)"
                  :disabled="stopping === proxy.id"
                  class="px-2.5 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded disabled:opacity-40"
                >
                  <i v-if="stopping === proxy.id" class="fas fa-spinner fa-spin mr-1"></i>
                  <i v-else class="fas fa-stop mr-1"></i>
                  Stop
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="showModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showModal = false">
        <div class="bg-slate-900 border border-slate-800 rounded-lg p-5 w-96">
          <h2 class="text-sm font-medium text-slate-200 mb-4">New SOCKS5 Proxy</h2>
          <div class="space-y-3">
            <div>
              <label class="block text-xs text-slate-400 mb-1">Client</label>
              <select
                v-model="newProxy.clientId"
                class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option value="" disabled>Select client...</option>
                <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.nickname || c.host }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1">Port</label>
              <input
                v-model.number="newProxy.port"
                type="number"
                min="1"
                max="65535"
                class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div class="flex justify-end gap-2 mt-5">
            <button @click="showModal = false" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded">Cancel</button>
            <button
              @click="createProxy"
              :disabled="!newProxy.clientId || creating"
              class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded"
            >
              <i v-if="creating" class="fas fa-spinner fa-spin mr-1"></i>
              Create
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
