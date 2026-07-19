<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../lib/api'

const serverUrl = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

async function publish() {
  if (!serverUrl.value) return
  loading.value = true
  error.value = ''
  success.value = ''
  try {
    await api.post('/api/sol/publish', { serverUrl: serverUrl.value })
    success.value = 'Published successfully'
  } catch (e: any) {
    error.value = e.message || 'Failed to publish'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-xl mx-auto">
      <h1 class="text-xl font-semibold text-slate-100 mb-6">SOL Publish</h1>

      <div class="bg-slate-900 border border-slate-800 rounded p-5">
        <div class="mb-4">
          <label class="block text-xs text-slate-400 mb-1.5">Server URL</label>
          <input
            v-model="serverUrl"
            placeholder="https://example.com"
            class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
        <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

        <button
          @click="publish"
          :disabled="!serverUrl || loading"
          class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i>
          <i v-else class="fas fa-paper-plane mr-2"></i>
          {{ loading ? 'Publishing...' : 'Publish' }}
        </button>
      </div>

      <div class="mt-6 bg-slate-900/50 border border-slate-800/50 rounded p-4">
        <h2 class="text-xs font-medium text-slate-400 mb-2">About</h2>
        <p class="text-xs text-slate-500 leading-relaxed">
          Publish your server configuration to the SOL network. This allows agents to discover and connect to your server automatically.
        </p>
      </div>
    </div>
  </div>
</template>
