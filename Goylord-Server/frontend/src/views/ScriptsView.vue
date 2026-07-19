<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { api } from '../lib/api'

interface Script {
  id: number
  name: string
  content: string
  createdAt: string
  updatedAt: string
}

interface Client {
  id: string
  host: string
  nickname?: string
  online: boolean
}

const scripts = ref<Script[]>([])
const clients = ref<Client[]>([])
const selectedScriptId = ref<number | null>(null)
const editorContent = ref('')
const scriptName = ref('')
const loading = ref(true)
const saving = ref(false)
const executing = ref(false)
const error = ref('')
const success = ref('')
const showExecute = ref(false)
const selectedClients = ref<string[]>([])
const searchQuery = ref('')

async function loadScripts() {
  loading.value = true
  try {
    const data = await api.get<Script[]>('/api/saved-scripts')
    scripts.value = data
  } catch (e: any) {
    error.value = e.message || 'Failed to load scripts'
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

function selectScript(script: Script) {
  selectedScriptId.value = script.id
  editorContent.value = script.content
  scriptName.value = script.name
}

async function createScript() {
  error.value = ''
  try {
    const newScript = await api.post<Script>('/api/saved-scripts', {
      name: 'Untitled Script',
      content: ''
    })
    await loadScripts()
    selectScript(newScript)
    success.value = 'Script created'
  } catch (e: any) {
    error.value = e.message || 'Failed to create script'
  }
}

async function saveScript() {
  if (!selectedScriptId.value) return
  saving.value = true
  error.value = ''
  try {
    await api.patch(`/api/saved-scripts/${selectedScriptId.value}`, {
      name: scriptName.value,
      content: editorContent.value
    })
    success.value = 'Saved'
    await loadScripts()
  } catch (e: any) {
    error.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

async function deleteScript(id: number) {
  error.value = ''
  try {
    await api.delete(`/api/saved-scripts/${id}`)
    if (selectedScriptId.value === id) {
      selectedScriptId.value = null
      editorContent.value = ''
      scriptName.value = ''
    }
    success.value = 'Deleted'
    await loadScripts()
  } catch (e: any) {
    error.value = e.message || 'Failed to delete'
  }
}

async function executeScript() {
  if (selectedClients.value.length === 0) return
  executing.value = true
  error.value = ''
  try {
    for (const clientId of selectedClients.value) {
      await api.post(`/api/clients/${clientId}/command`, {
        command: 'run-script',
        script: editorContent.value
      })
    }
    success.value = `Script sent to ${selectedClients.value.length} client(s)`
    showExecute.value = false
    selectedClients.value = []
  } catch (e: any) {
    error.value = e.message || 'Failed to execute'
  } finally {
    executing.value = false
  }
}

function toggleClient(id: string) {
  const idx = selectedClients.value.indexOf(id)
  if (idx >= 0) selectedClients.value.splice(idx, 1)
  else selectedClients.value.push(id)
}

function filteredScripts() {
  if (!searchQuery.value) return scripts.value
  const q = searchQuery.value.toLowerCase()
  return scripts.value.filter(s => s.name.toLowerCase().includes(q))
}

onMounted(() => {
  loadScripts()
  loadClients()
})
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-slate-100">Scripts</h1>
        <div class="flex gap-2">
          <button
            @click="createScript"
            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
          >
            <i class="fas fa-plus mr-1.5"></i>New Script
          </button>
          <button
            v-if="selectedScriptId"
            @click="showExecute = true; loadClients()"
            class="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded"
          >
            <i class="fas fa-play mr-1.5"></i>Execute
          </button>
        </div>
      </div>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="flex gap-4" style="height: calc(100vh - 200px);">
        <div class="w-64 flex-shrink-0 bg-slate-900 border border-slate-800 rounded flex flex-col">
          <div class="p-3 border-b border-slate-800">
            <input
              v-model="searchQuery"
              placeholder="Search scripts..."
              class="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading" class="p-4 text-center text-slate-500 text-sm">
              <i class="fas fa-spinner fa-spin"></i>
            </div>
            <div v-else-if="filteredScripts().length === 0" class="p-4 text-center text-slate-500 text-sm">
              No scripts
            </div>
            <button
              v-for="script in filteredScripts()"
              :key="script.id"
              @click="selectScript(script)"
              :class="[
                'w-full text-left px-3 py-2.5 border-b border-slate-800/50 text-sm transition-colors',
                selectedScriptId === script.id
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'text-slate-300 hover:bg-slate-800/50'
              ]"
            >
              <div class="truncate">{{ script.name }}</div>
              <div class="text-xs text-slate-500 mt-0.5">{{ new Date(script.updatedAt).toLocaleDateString() }}</div>
            </button>
          </div>
        </div>

        <div class="flex-1 flex flex-col bg-slate-900 border border-slate-800 rounded">
          <template v-if="selectedScriptId">
            <div class="p-3 border-b border-slate-800 flex items-center gap-3">
              <input
                v-model="scriptName"
                class="flex-1 px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
              <button
                @click="saveScript"
                :disabled="saving"
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded"
              >
                <i :class="saving ? 'fas fa-spinner fa-spin mr-1.5' : 'fas fa-save mr-1.5'"></i>Save
              </button>
              <button
                @click="deleteScript(selectedScriptId!)"
                class="px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded"
              >
                <i class="fas fa-trash mr-1.5"></i>Delete
              </button>
            </div>
            <textarea
              v-model="editorContent"
              class="flex-1 p-4 bg-transparent text-slate-200 text-sm font-mono resize-none focus:outline-none placeholder-slate-600"
              placeholder="Write your script here..."
              spellcheck="false"
            ></textarea>
          </template>
          <div v-else class="flex-1 flex items-center justify-center text-slate-500 text-sm">
            Select a script or create a new one
          </div>
        </div>
      </div>

      <div v-if="showExecute" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showExecute = false">
        <div class="bg-slate-900 border border-slate-800 rounded-lg p-5 w-96 max-h-[70vh] flex flex-col">
          <h2 class="text-sm font-medium text-slate-200 mb-3">Execute on clients</h2>
          <div class="flex-1 overflow-y-auto mb-3 space-y-1">
            <label
              v-for="client in clients"
              :key="client.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800/50 cursor-pointer text-sm text-slate-300"
            >
              <input
                type="checkbox"
                :checked="selectedClients.includes(client.id)"
                @change="toggleClient(client.id)"
                class="rounded border-slate-600 bg-slate-800"
              />
              {{ client.nickname || client.host }}
            </label>
            <div v-if="clients.length === 0" class="text-center text-slate-500 text-sm py-4">
              No online clients
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="showExecute = false" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded">Cancel</button>
            <button
              @click="executeScript"
              :disabled="selectedClients.length === 0 || executing"
              class="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm rounded"
            >
              <i v-if="executing" class="fas fa-spinner fa-spin mr-1.5"></i>
              Run ({{ selectedClients.length }})
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
