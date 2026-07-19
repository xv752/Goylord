<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'

interface Client {
  id: string
  host: string
  groupId: string | null
  groupName: string
  groupColor: string
  online: boolean
  os: string
}

interface Group {
  id: number
  name: string
  color: string
}

const clients = ref<Client[]>([])
const groups = ref<Group[]>([])
const loading = ref(true)
const selectedGroup = ref<number | null>(null)

async function loadData() {
  loading.value = true
  try {
    const [clientsData, groupsData] = await Promise.all([
      api.get<{ items: Client[] }>('/api/clients?pageSize=9999'),
      api.get<{ groups: Group[] }>('/api/groups')
    ])
    clients.value = clientsData.items || []
    groups.value = groupsData.groups || []
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

const groupStats = computed(() => {
  const stats: { group: Group | null; count: number; online: number; clients: Client[] }[] = []
  const grouped = new Map<string, Client[]>()
  const ungrouped: Client[] = []

  for (const c of clients.value) {
    if (c.groupId) {
      if (!grouped.has(c.groupId)) grouped.set(c.groupId, [])
      grouped.get(c.groupId)!.push(c)
    } else {
      ungrouped.push(c)
    }
  }

  for (const g of groups.value) {
    const gc = grouped.get(g.id) || []
    stats.push({ group: g, count: gc.length, online: gc.filter(c => c.online).length, clients: gc })
  }

  if (ungrouped.length > 0) {
    stats.push({ group: null, count: ungrouped.length, online: ungrouped.filter(c => c.online).length, clients: ungrouped })
  }

  return stats
})

const filteredClients = computed(() => {
  if (selectedGroup.value === null) return clients.value
  if (selectedGroup.value === -1) return clients.value.filter(c => !c.groupId)
  return clients.value.filter(c => c.groupId === selectedGroup.value)
})

function barWidth(count: number) {
  if (clients.value.length === 0) return 0
  return Math.round((count / clients.value.length) * 100)
}

function colorClass(color: string) {
  const map: Record<string, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-500'
  }
  return map[color] || 'bg-slate-500'
}

function colorDot(color: string) {
  const map: Record<string, string> = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
    cyan: 'bg-cyan-500',
    orange: 'bg-orange-500',
    gray: 'bg-gray-500'
  }
  return map[color] || 'bg-slate-500'
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-5xl mx-auto">
      <h1 class="text-xl font-semibold text-slate-100 mb-6">Group Graph</h1>

      <div v-if="loading" class="text-center py-12 text-slate-500 text-sm">
        <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
      </div>

      <template v-else>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div class="bg-slate-900 border border-slate-800 rounded p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm text-slate-300">Total Clients</span>
              <span class="text-lg font-semibold text-slate-100">{{ clients.length }}</span>
            </div>
            <div class="h-1 bg-slate-800 rounded overflow-hidden">
              <div class="h-full bg-slate-500 rounded" style="width: 100%"></div>
            </div>
          </div>

          <div
            v-for="stat in groupStats"
            :key="stat.group?.id ?? 'ungrouped'"
            @click="selectedGroup = stat.group?.id ?? -1"
            :class="[
              'bg-slate-900 border rounded p-4 cursor-pointer transition-colors',
              selectedGroup === (stat.group?.id ?? -1)
                ? 'border-blue-500/50'
                : 'border-slate-800 hover:border-slate-700'
            ]"
          >
            <div class="flex items-center gap-2 mb-2">
              <div
                :class="[stat.group ? colorDot(stat.group.color) : 'bg-slate-600', 'w-2.5 h-2.5 rounded-full']"
              ></div>
              <span class="text-sm text-slate-300">{{ stat.group?.name || 'Ungrouped' }}</span>
              <span class="ml-auto text-lg font-semibold text-slate-100">{{ stat.count }}</span>
            </div>
            <div class="h-1 bg-slate-800 rounded overflow-hidden">
              <div
                :class="[stat.group ? colorClass(stat.group.color) : 'bg-slate-600', 'h-full rounded']"
                :style="{ width: barWidth(stat.count) + '%' }"
              ></div>
            </div>
            <div class="text-xs text-slate-500 mt-1.5">
              {{ stat.online }} online / {{ stat.count - stat.online }} offline
            </div>
          </div>
        </div>

        <div class="bg-slate-900 border border-slate-800 rounded p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-medium text-slate-300">
              {{ selectedGroup === null ? 'All Clients' : groups.find(g => g.id === selectedGroup)?.name || 'Ungrouped' }}
              <span class="text-slate-500 font-normal">({{ filteredClients.length }})</span>
            </h2>
            <button
              v-if="selectedGroup !== null"
              @click="selectedGroup = null"
              class="text-xs text-slate-400 hover:text-slate-200"
            >
              <i class="fas fa-times mr-1"></i>Clear filter
            </button>
          </div>
          <div v-if="filteredClients.length === 0" class="text-center py-8 text-slate-500 text-sm">
            No clients in this group
          </div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <div
              v-for="client in filteredClients"
              :key="client.id"
              class="flex items-center gap-2 px-3 py-2 bg-slate-800/50 rounded text-sm"
            >
              <i
                :class="client.online ? 'fas fa-circle text-green-400' : 'fas fa-circle text-slate-600'"
                class="text-[8px]"
              ></i>
              <span class="text-slate-200 truncate">{{ client.nickname || client.host }}</span>
              <span class="text-xs text-slate-500 ml-auto">{{ client.os }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
