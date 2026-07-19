<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface Client {
  id: string
  host: string
  user: string
  os: string
  online: boolean
  lastSeen: number
  cpu?: string
  gpu?: string
  ram?: string
  monitors?: number
}

const clients = ref<Client[]>([])
const loading = ref(true)
const serverVersion = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadClients() {
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = data.items || []
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function loadVersion() {
  try {
    const data = await api.get<{ version: string }>('/api/version')
    serverVersion.value = data.version
  } catch {
    serverVersion.value = 'unknown'
  }
}

const totalClients = computed(() => clients.value.length)
const onlineClients = computed(() => clients.value.filter(c => c.online))
const offlineClients = computed(() => clients.value.filter(c => !c.online))
const idleClients = computed(() => {
  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  return clients.value.filter(c => !c.online && new Date(c.lastSeen).getTime() > fiveMinAgo)
})

const osGroups = computed(() => {
  const groups: Record<string, Client[]> = {}
  for (const c of clients.value) {
    const os = c.os || 'Unknown'
    if (!groups[os]) groups[os] = []
    groups[os].push(c)
  }
  return Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
})

function onlinePercent() {
  if (totalClients.value === 0) return 0
  return Math.round((onlineClients.value.length / totalClients.value) * 100)
}

onMounted(() => {
  loadClients()
  loadVersion()
  refreshTimer = setInterval(() => {
    loadClients()
  }, 15000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-5xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-slate-100">Metrics</h1>
        <div class="text-xs text-slate-500">
          Server v{{ serverVersion }}
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        <div class="bg-slate-900 border border-slate-800 rounded p-4">
          <div class="text-xs text-slate-400 mb-1">Total Clients</div>
          <div class="text-2xl font-semibold text-slate-100">{{ totalClients }}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-4">
          <div class="text-xs text-slate-400 mb-1">Online</div>
          <div class="text-2xl font-semibold text-green-400">{{ onlineClients.length }}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-4">
          <div class="text-xs text-slate-400 mb-1">Offline</div>
          <div class="text-2xl font-semibold text-slate-500">{{ offlineClients.length }}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 rounded p-4">
          <div class="text-xs text-slate-400 mb-1">Idle</div>
          <div class="text-2xl font-semibold text-yellow-400">{{ idleClients.length }}</div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded p-4 mb-6">
        <div class="text-xs text-slate-400 mb-2">Online Rate</div>
        <div class="flex items-center gap-3">
          <div class="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
            <div
              class="h-full bg-green-500 rounded transition-all duration-500"
              :style="{ width: onlinePercent() + '%' }"
            ></div>
          </div>
          <span class="text-sm text-slate-300 w-12 text-right">{{ onlinePercent() }}%</span>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded p-4">
        <h2 class="text-sm font-medium text-slate-300 mb-3">Clients by OS</h2>
        <div v-if="loading" class="text-center py-8 text-slate-500 text-sm">
          <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
        </div>
        <div v-else-if="osGroups.length === 0" class="text-center py-8 text-slate-500 text-sm">
          No clients
        </div>
        <div v-else class="space-y-3">
          <div v-for="[os, group] in osGroups" :key="os">
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm text-slate-300">{{ os }}</span>
              <span class="text-xs text-slate-500">{{ group.length }} clients</span>
            </div>
            <div class="flex items-center gap-3">
              <div class="flex-1 h-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  class="h-full bg-blue-500 rounded"
                  :style="{ width: Math.round((group.length / totalClients) * 100) + '%' }"
                ></div>
              </div>
              <div class="flex gap-1">
                <span class="text-xs text-green-400">{{ group.filter(c => c.online).length }} on</span>
                <span class="text-xs text-slate-600">/</span>
                <span class="text-xs text-slate-500">{{ group.filter(c => !c.online).length }} off</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded p-4 mt-6">
        <h2 class="text-sm font-medium text-slate-300 mb-3">Recent Clients</h2>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-800 text-left text-slate-400">
                <th class="px-3 py-2 font-medium">Hostname</th>
                <th class="px-3 py-2 font-medium">OS</th>
                <th class="px-3 py-2 font-medium">Status</th>
                <th class="px-3 py-2 font-medium">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="client in clients.slice(0, 20)"
                :key="client.id"
                class="border-b border-slate-800/50"
              >
                <td class="px-3 py-2 text-slate-200">{{ client.nickname || client.host }}</td>
                <td class="px-3 py-2 text-slate-400">{{ client.os }}</td>
                <td class="px-3 py-2">
                  <span
                    :class="client.online ? 'text-green-400' : 'text-slate-500'"
                    class="text-xs"
                  >
                    <i :class="client.online ? 'fas fa-circle' : 'far fa-circle'" class="mr-1 text-[8px]"></i>
                    {{ client.online ? 'Online' : 'Offline' }}
                  </span>
                </td>
                <td class="px-3 py-2 text-slate-500 text-xs">
                  {{ new Date(client.lastSeen).toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
