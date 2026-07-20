<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

interface Plugin {
  id: string; name: string; version: string; enabled: boolean; runtime?: string
  trusted?: string; fingerprint?: string; lastError?: string; autoload?: boolean
  isServerOnly?: boolean; running?: boolean; buildPlugin?: boolean
  settings?: Record<string, any>
}

const plugins = ref<Plugin[]>([])
const loading = ref(true)
const uploading = ref(false)
const toggling = ref<string | null>(null)
const error = ref('')
const success = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const confirmModal = ref<{ plugin: Plugin; action: string } | null>(null)
const confirmText = ref('')

const trustedKeys = ref<string[]>([])
const builtinKeys = ref<string[]>([])
const newTrustedKey = ref('')
const showTrustedKeys = ref(false)
const keysLoading = ref(false)

async function loadPlugins() {
  loading.value = true
  try {
    const data = await api.get<{ plugins: Plugin[] }>('/api/plugins')
    plugins.value = data.plugins
  } catch {} finally { loading.value = false }
}

async function loadTrustedKeys() {
  keysLoading.value = true
  try {
    const data = await api.get<{ trustedKeys: string[]; builtinKeys: string[] }>('/api/plugins/trusted-keys')
    trustedKeys.value = data.trustedKeys || []
    builtinKeys.value = data.builtinKeys || []
    showTrustedKeys.value = true
  } catch (e: any) {
    if (e?.status === 403) { showTrustedKeys.value = false }
    else { error.value = e.message || 'Failed to load keys' }
  } finally { keysLoading.value = false }
}

async function addTrustedKey() {
  const fp = newTrustedKey.value.trim()
  if (!/^[a-f0-9]{64}$/i.test(fp)) { error.value = 'Key must be exactly 64 hex characters (SHA-256 fingerprint)'; return }
  try {
    await api.post('/api/plugins/trusted-keys', { fingerprint: fp })
    newTrustedKey.value = ''; success.value = 'Trusted key added'
    await loadTrustedKeys(); await loadPlugins()
  } catch (e: any) { error.value = e.message || 'Failed to add key' }
}

async function removeTrustedKey(fingerprint: string) {
  try {
    await api.delete(`/api/plugins/trusted-keys/${fingerprint}`)
    success.value = 'Key removed'
    await loadTrustedKeys(); await loadPlugins()
  } catch (e: any) { error.value = e.message || 'Failed to remove key' }
}

async function togglePlugin(plugin: Plugin) {
  const enabling = !plugin.enabled
  if (enabling && plugin.trusted !== 'trusted') {
    confirmModal.value = { plugin, action: 'enable' }
    return
  }
  toggling.value = plugin.id; error.value = ''
  try {
    await api.post(`/api/plugins/${plugin.id}/enable`, { enabled: enabling })
    plugin.enabled = enabling
    success.value = `${plugin.name} ${enabling ? 'enabled' : 'disabled'}`
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { toggling.value = null }
}

async function toggleAutoload(plugin: Plugin) {
  try {
    await api.post(`/api/plugins/${plugin.id}/autoload`, { autoLoad: !plugin.autoload })
    plugin.autoload = !plugin.autoload
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function deletePlugin(id: string) {
  try {
    await api.delete(`/api/plugins/${id}`)
    plugins.value = plugins.value.filter(p => p.id !== id)
    success.value = 'Plugin removed'
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function handleUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true; error.value = ''
  try {
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/plugins/upload', { method: 'POST', credentials: 'include', body: fd })
    const data = await res.json()
    if (!data.ok && !data.plugin) throw new Error(data.error || 'Upload failed')
    success.value = 'Plugin uploaded'
    await loadPlugins()
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { uploading.value = false; if (fileInput.value) fileInput.value.value = '' }
}

function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file && file.name.endsWith('.zip')) {
    const dt = new DataTransfer(); dt.items.add(file)
    if (fileInput.value) { fileInput.value.files = dt.files; fileInput.value.dispatchEvent(new Event('change')) }
  }
}

function runtimeBadge(plugin: Plugin) {
  if (plugin.isServerOnly) return { text: 'Server Extension', cls: 'badge-primary' }
  if (plugin.runtime?.includes('wasm')) return { text: 'WASM', cls: 'badge-info' }
  if (plugin.runtime?.includes('2.0')) return { text: 'Plugin 2.0', cls: 'badge-success' }
  return { text: 'Legacy', cls: '' }
}

function trustBadge(plugin: Plugin) {
  switch (plugin.trusted) {
    case 'trusted': return { icon: 'fa-solid fa-shield-check', color: '#86efac', text: 'Trusted' }
    case 'untrusted': return { icon: 'fa-solid fa-shield-exclamation', color: '#fca5a5', text: 'Untrusted' }
    case 'unsigned': return { icon: 'fa-solid fa-shield', color: '#fbbf24', text: 'Unsigned' }
    default: return { icon: 'fa-solid fa-shield', color: '#64748b', text: 'Unknown' }
  }
}

function confirmAction() {
  if (!confirmModal.value) return
  const p = confirmModal.value.plugin
  if (confirmText.value === 'confirm') {
    api.post(`/api/plugins/${p.id}/enable`, { enabled: true, confirmed: true }).then(() => {
      p.enabled = true; p.trusted = 'trusted'; success.value = `${p.name} enabled`
    }).catch((e: any) => { error.value = e.message })
  }
  confirmModal.value = null; confirmText.value = ''
}

onMounted(loadPlugins)
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-puzzle-piece" style="margin-right:8px;color:#a78bfa"></i>Plugins</h1>
      <div style="display:flex;gap:8px">
        <button @click="loadPlugins" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
        <input ref="fileInput" type="file" accept=".zip" class="hidden" @change="handleUpload" />
        <button @click="fileInput?.click()" :disabled="uploading" class="btn btn-primary btn-sm">
          <i v-if="uploading" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-upload"></i>Upload Plugin
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" :style="{border: dragOver ? '2px dashed #6366f1' : '2px dashed transparent', borderRadius:'14px', padding: dragOver ? '20px' : '0', transition:'all 150ms', marginBottom:'16px'}">
      <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading plugins...</div>
      <div v-else-if="plugins.length === 0" class="empty-state">
        <i class="fa-solid fa-puzzle-piece" style="font-size:32px;color:#334155;display:block;margin-bottom:12px"></i>
        No plugins installed. Drag a .zip here or click Upload.
      </div>
      <div v-else style="display:grid;grid-template-columns:repeat(auto-fill, minmax(340px, 1fr));gap:12px">
        <div v-for="plugin in plugins" :key="plugin.id" :class="['card-flat', plugin.isServerOnly ? 'card-flat' : '']" :style="{padding:'14px',borderColor: plugin.isServerOnly ? 'rgba(192,132,252,0.3)' : plugin.enabled ? 'rgba(34,197,94,0.2)' : 'rgba(51,65,85,0.6)'}">
          <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
                <span style="font-size:14px;font-weight:600;color:#e2e8f0">{{ plugin.name }}</span>
                <span style="font-size:11px;color:#64748b">v{{ plugin.version }}</span>
              </div>
              <div style="display:flex;gap:4px;flex-wrap:wrap">
                <span :class="['badge', 'badge-sm', runtimeBadge(plugin).cls]">{{ runtimeBadge(plugin).text }}</span>
                <span class="badge badge-sm" v-if="plugin.buildPlugin" style="background:rgba(251,191,36,0.1);color:#fcd34d;border-color:rgba(251,191,36,0.2)">Build Plugin</span>
                <span class="badge badge-sm" :style="{color: trustBadge(plugin).color, borderColor: trustBadge(plugin).color + '33'}">
                  <i :class="trustBadge(plugin).icon" style="font-size:9px"></i>{{ trustBadge(plugin).text }}
                </span>
              </div>
              <div v-if="plugin.fingerprint" style="font-size:10px;color:#475569;margin-top:3px;font-family:monospace" :title="plugin.fingerprint">
                FP: {{ plugin.fingerprint.slice(0, 16) }}...
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active:plugin.enabled}" @click="togglePlugin(plugin)" :disabled="toggling===plugin.id"></button>
              <button @click="deletePlugin(plugin.id)" class="btn-icon-sm" title="Remove"><i class="fa-solid fa-trash" style="font-size:10px"></i></button>
            </div>
          </div>

          <div v-if="plugin.lastError" style="margin-top:8px;padding:6px 8px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);border-radius:6px;font-size:11px;color:#fca5a5">
            <i class="fa-solid fa-circle-exclamation" style="margin-right:4px"></i>{{ plugin.lastError }}
          </div>

          <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
            <button @click="toggleAutoload(plugin)" :class="plugin.autoload ? 'badge-success' : ''" class="badge badge-sm" :style="{cursor:'pointer',borderColor: plugin.autoload ? 'rgba(34,197,94,0.3)' : undefined, background: plugin.autoload ? 'rgba(34,197,94,0.1)' : undefined, color: plugin.autoload ? '#86efac' : undefined}">
              <i class="fa-solid fa-bolt" style="font-size:9px"></i>Autoload
            </button>
            <span v-if="plugin.isServerOnly" style="font-size:11px;color:#64748b">
              <span class="status-dot" :class="plugin.running ? 'status-dot-online' : 'status-dot-offline'" style="width:6px;height:6px;margin-right:4px"></span>
              {{ plugin.running ? 'Running' : 'Stopped' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Trusted Signing Keys -->
    <div class="panel" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px">
          <i class="fa-solid fa-key" style="color:#94a3b8;font-size:13px"></i>
          <h3 style="font-size:13px;font-weight:600;color:#e2e8f0">Trusted Signing Keys</h3>
        </div>
        <button v-if="!showTrustedKeys" @click="loadTrustedKeys" class="btn btn-ghost btn-sm" :disabled="keysLoading">
          <i v-if="keysLoading" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-key"></i>Manage Keys
        </button>
        <button v-else @click="showTrustedKeys = false" class="btn btn-ghost btn-sm"><i class="fa-solid fa-chevron-up"></i></button>
      </div>
      <p style="font-size:12px;color:#64748b;margin-bottom:10px">Plugins signed by a trusted key can be loaded without confirmation. Add key fingerprints (SHA-256 hex) here.</p>

      <div v-if="showTrustedKeys">
        <div v-if="builtinKeys.length" style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Built-in Keys</div>
          <div v-for="key in builtinKeys" :key="key" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(34,197,94,0.05);border:1px solid rgba(34,197,94,0.15);border-radius:8px;margin-bottom:4px;font-size:11px">
            <i class="fa-solid fa-lock" style="color:#22c55e;font-size:10px"></i>
            <code style="color:#86efac;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis">{{ key }}</code>
            <span class="badge badge-xs badge-success">Built-in</span>
          </div>
        </div>

        <div v-if="trustedKeys.length > builtinKeys.length" style="margin-bottom:12px">
          <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">User-Added Keys</div>
          <div v-for="key in trustedKeys.filter(k => !builtinKeys.includes(k))" :key="key" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(99,102,241,0.05);border:1px solid rgba(99,102,241,0.15);border-radius:8px;margin-bottom:4px;font-size:11px">
            <i class="fa-solid fa-key" style="color:#818cf8;font-size:10px"></i>
            <code style="color:#c7d2fe;font-family:monospace;flex:1;overflow:hidden;text-overflow:ellipsis">{{ key }}</code>
            <button @click="removeTrustedKey(key)" class="btn-icon-sm" style="width:22px;height:22px" title="Remove"><i class="fa-solid fa-xmark" style="font-size:9px;color:#f87171"></i></button>
          </div>
        </div>

        <div style="display:flex;gap:8px;align-items:center">
          <input v-model="newTrustedKey" placeholder="Paste 64-char hex fingerprint..." class="input" style="flex:1;font-size:11px;font-family:monospace;padding:7px 10px" maxlength="64" @keydown.enter="addTrustedKey" />
          <button @click="addTrustedKey" :disabled="newTrustedKey.length !== 64" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus" style="margin-right:4px"></i>Add Key</button>
        </div>
      </div>
    </div>

    <div v-if="confirmModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="confirmModal = null">
      <div class="panel" style="width:380px">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:10px">Confirm {{ confirmModal.action }}</h2>
        <p style="font-size:13px;color:#94a3b8;margin-bottom:12px">
          Plugin <strong>{{ confirmModal.plugin.name }}</strong> is {{ confirmModal.plugin.trusted }}. Type <code>confirm</code> to proceed.
        </p>
        <input v-model="confirmText" placeholder="Type 'confirm'" class="input" style="width:100%;margin-bottom:12px" @keydown.enter="confirmAction" />
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button @click="confirmModal = null" class="btn btn-sm">Cancel</button>
          <button @click="confirmAction" :disabled="confirmText !== 'confirm'" class="btn btn-danger btn-sm">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>
