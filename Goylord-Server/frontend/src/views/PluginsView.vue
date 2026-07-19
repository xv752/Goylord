<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

interface Plugin {
  id: string
  name: string
  version: string
  enabled: boolean
}

const plugins = ref<Plugin[]>([])
const loading = ref(true)
const toggling = ref<string | null>(null)
const uploading = ref(false)
const error = ref('')
const success = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

async function loadPlugins() {
  loading.value = true
  try {
    const data = await api.get<Plugin[]>('/api/plugins')
    plugins.value = data
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function togglePlugin(plugin: Plugin) {
  toggling.value = plugin.id
  error.value = ''
  try {
    if (plugin.enabled) {
      await api.post(`/api/plugins/${plugin.id}/disable`)
    } else {
      await api.post(`/api/plugins/${plugin.id}/enable`)
    }
    plugin.enabled = !plugin.enabled
  } catch (e: any) {
    error.value = e.message || 'Failed to toggle plugin'
  } finally {
    toggling.value = null
  }
}

async function deletePlugin(id: string) {
  error.value = ''
  try {
    await api.delete(`/api/plugins/${id}`)
    plugins.value = plugins.value.filter(p => p.id !== id)
    success.value = 'Plugin deleted'
  } catch (e: any) {
    error.value = e.message || 'Failed to delete plugin'
  }
}

async function uploadPlugin(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  error.value = ''
  success.value = ''
  try {
    const formData = new FormData()
    formData.append('file', file)
    await fetch('/api/plugins/upload', {
      method: 'POST',
      body: formData
    })
    success.value = 'Plugin uploaded'
    await loadPlugins()
  } catch (e: any) {
    error.value = e.message || 'Failed to upload plugin'
  } finally {
    uploading.value = false
    if (fileInput.value) fileInput.value.value = ''
  }
}

onMounted(loadPlugins)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-slate-100">Plugins</h1>
        <div class="flex gap-2">
          <input
            ref="fileInput"
            type="file"
            accept=".zip"
            class="hidden"
            @change="uploadPlugin"
          />
          <button
            @click="fileInput?.click()"
            :disabled="uploading"
            class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded"
          >
            <i v-if="uploading" class="fas fa-spinner fa-spin mr-1.5"></i>
            <i v-else class="fas fa-upload mr-1.5"></i>
            Upload Plugin
          </button>
        </div>
      </div>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="bg-slate-900 border border-slate-800 rounded overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-800 text-left text-slate-400">
              <th class="px-4 py-2.5 font-medium">Name</th>
              <th class="px-4 py-2.5 font-medium">Version</th>
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
            <tr v-else-if="plugins.length === 0">
              <td colspan="4" class="px-4 py-8 text-center text-slate-500">
                No plugins installed
              </td>
            </tr>
            <tr
              v-for="plugin in plugins"
              :key="plugin.id"
              class="border-b border-slate-800/50"
            >
              <td class="px-4 py-3 text-slate-200">{{ plugin.name }}</td>
              <td class="px-4 py-3 text-slate-400 text-xs">{{ plugin.version }}</td>
              <td class="px-4 py-3">
                <button
                  @click="togglePlugin(plugin)"
                  :disabled="toggling === plugin.id"
                  class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40"
                  :class="plugin.enabled ? 'bg-green-600' : 'bg-slate-700'"
                >
                  <span
                    :class="[
                      'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
                      plugin.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                    ]"
                    :style="{ transform: plugin.enabled ? 'translateX(18px)' : 'translateX(2px)' }"
                  ></span>
                </button>
                <span
                  :class="['ml-2 text-xs', plugin.enabled ? 'text-green-400' : 'text-slate-500']"
                >
                  {{ plugin.enabled ? 'Enabled' : 'Disabled' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button
                  @click="deletePlugin(plugin.id)"
                  class="text-slate-400 hover:text-red-400"
                  title="Delete plugin"
                >
                  <i class="fas fa-trash text-xs"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
