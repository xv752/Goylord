<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface Proxy {
  clientId: string; port: number; connections?: number; createdAt?: string
  host?: string; nickname?: string
}

interface Client {
  id: string; host: string; nickname?: string; online: boolean
}

const proxies = ref<Proxy[]>([])
const clients = ref<Client[]>([])
const loading = ref(true)
const showModal = ref(false)
const creating = ref(false)
const newProxy = ref({ clientId: '', port: 1080 })
const error = ref('')
const success = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadProxies() {
  try {
    const data = await api.get<{ proxies: Proxy[] }>('/api/proxy/list')
    proxies.value = data.proxies || []
  } catch {} finally { loading.value = false }
}

async function loadClients() {
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {}
}

async function createProxy() {
  if (!newProxy.value.clientId) return
  creating.value = true; error.value = ''
  try {
    const port = newProxy.value.port
    const data = await api.post<{ ok: boolean; port?: number; message?: string }>('/api/proxy/start', newProxy.value)
    if (!data.ok) throw new Error(data.message || 'Failed to start proxy')
    showModal.value = false
    newProxy.value = { clientId: '', port: 1080 }
    await loadProxies()
    success.value = `Proxy started on port ${port}`
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { creating.value = false }
}

async function stopProxy(port: number) {
  error.value = ''
  try {
    const data = await api.post<{ ok: boolean; message?: string }>('/api/proxy/stop', { port })
    if (!data.ok) throw new Error(data.message || 'Failed to stop')
    await loadProxies()
  } catch (e: any) { error.value = e.message || 'Failed' }
}

function openModal() { loadClients(); showModal.value = true }

function proxyUrl(proxy: Proxy) {
  return `socks5://${proxy.host || proxy.clientId}:${proxy.port}`
}

onMounted(() => {
  loadProxies()
  refreshTimer = setInterval(loadProxies, 5000)
})
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <h1 class="section-title"><i class="fa-solid fa-network-wired" style="margin-right:8px;color:#38bdf8"></i>SOCKS5 Proxies</h1>
        <span class="badge badge-sm"><span class="status-dot status-dot-online" style="width:6px;height:6px"></span>Auto-refresh 5s</span>
      </div>
      <button @click="openModal" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i>New Proxy</button>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Port</th>
            <th>Proxy URL</th>
            <th>Status</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td>
          </tr>
          <tr v-else-if="proxies.length === 0">
            <td colspan="5" class="empty-state">No active proxies</td>
          </tr>
          <tr v-for="p in proxies" :key="p.port">
            <td style="font-weight:500;color:#e2e8f0">{{ p.nickname || p.host || p.clientId }}</td>
            <td style="font-family:ui-monospace,monospace;font-size:12px;color:#94a3b8">{{ p.port }}</td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8">{{ proxyUrl(p) }}</td>
            <td><span class="badge badge-sm badge-success">Active</span></td>
            <td style="text-align:right">
              <button @click="stopProxy(p.port)" class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px">
                <i class="fa-solid fa-stop" style="margin-right:4px"></i>Stop
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="showModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showModal = false">
      <div class="panel" style="width:380px">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:14px">New SOCKS5 Proxy</h2>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Client</label>
            <AppSelect v-model="newProxy.clientId" :options="clients.map(c => ({ value: c.id, label: c.nickname || c.host }))" placeholder="Select client..." searchable />
          </div>
          <div>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Port</label>
            <input v-model.number="newProxy.port" type="number" min="1" max="65535" class="input" style="width:100%" />
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button @click="showModal = false" class="btn btn-sm">Cancel</button>
          <button @click="createProxy" :disabled="!newProxy.clientId || creating" class="btn btn-primary btn-sm">
            <i v-if="creating" class="fa-solid fa-spinner fa-spin"></i>Create
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
