<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface Script {
  id: string; name: string; content: string; scriptType: string; createdAt: string; updatedAt: string
}
interface Client {
  id: string; host: string; nickname?: string; online: boolean; os: string
}
interface AutoTask {
  id: string; name: string; trigger: string; script: string; scriptType: string
  enabled: boolean; osFilter: string[]; createdAt: string
}
interface Template {
  name: string; script: string; category: string; type: string
}

const scripts = ref<Script[]>([])
const clients = ref<Client[]>([])
const autoTasks = ref<AutoTask[]>([])
const selectedScriptId = ref<string | null>(null)
const editorContent = ref('')
const scriptName = ref('')
const scriptType = ref('powershell')
const loading = ref(true)
const saving = ref(false)
const executing = ref(false)
const searchQuery = ref('')
const error = ref('')
const success = ref('')
const showExecute = ref(false)
const showAutoTask = ref(false)
const selectedClients = ref<string[]>([])
const outputLines = ref<{ host: string; ok: boolean; detail: string }[]>([])
const mode = ref<'code' | 'visual'>('code')
const showTemplates = ref(false)
const templateSearch = ref('')
const autoTaskTrigger = ref('on_connect')
const autoTaskOsFilter = ref<string[]>([])
let editorEl = ref<HTMLTextAreaElement | null>(null)
let monacoInstance: any = null
const monacoReady = ref(false)
const monacoLoading = ref(false)

const TRIGGER_OPTIONS = [
  { value: 'on_connect', label: 'Every Connection', desc: 'Runs each time a client connects' },
  { value: 'on_first_connect', label: 'First Connection', desc: 'Runs on the very first connection' },
  { value: 'on_connect_once', label: 'Once per Client', desc: 'Runs once per client, then never again' },
]

const OS_FILTER_OPTIONS = [
  { value: 'windows', label: 'Windows' },
  { value: 'linux', label: 'Linux' },
  { value: 'darwin', label: 'macOS' },
  { value: 'android', label: 'Android' },
  { value: 'freebsd', label: 'FreeBSD' },
  { value: 'ios', label: 'iOS' },
]

const SCRIPT_TYPES = [
  { value: 'powershell', label: 'PowerShell' },
  { value: 'bash', label: 'Bash' },
  { value: 'cmd', label: 'CMD' },
  { value: 'python', label: 'Python' },
  { value: 'sh', label: 'Shell' },
]

const TEMPLATES: Template[] = [
  { name: 'System Info', script: 'systeminfo', category: 'Windows', type: 'cmd' },
  { name: 'Top Processes', script: 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 20 Name, CPU, WorkingSet', category: 'Windows', type: 'powershell' },
  { name: 'Network Info', script: 'ipconfig /all; nslookup google.com', category: 'Windows', type: 'cmd' },
  { name: 'AV Status', script: 'Get-MpComputerStatus | Select-Object RealTimeProtectionEnabled, AntivirusSignatureLastUpdated', category: 'Windows', type: 'powershell' },
  { name: 'Running Services', script: 'Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object Name, DisplayName', category: 'Windows', type: 'powershell' },
  { name: 'Disk Usage', script: 'df -h', category: 'Linux', type: 'bash' },
  { name: 'System Status', script: 'uptime; free -h; uname -a', category: 'Linux', type: 'bash' },
  { name: 'Top Processes', script: 'ps aux --sort=-%cpu | head -20', category: 'Linux', type: 'bash' },
  { name: 'Network Interfaces', script: 'ip addr show; ss -tlnp', category: 'Linux', type: 'bash' },
  { name: 'Failed Services', script: 'systemctl --failed', category: 'Linux', type: 'bash' },
  { name: 'System Info', script: 'system_profiler SPHardwareDataType SPSoftwareDataType', category: 'macOS', type: 'bash' },
  { name: 'Network Interfaces', script: 'ifconfig; networksetup -listallhardwareports', category: 'macOS', type: 'bash' },
  { name: 'Whoami', script: 'whoami /all', category: 'Red Team — Windows', type: 'cmd' },
  { name: 'Local Users', script: 'net user; net localgroup Administrators', category: 'Red Team — Windows', type: 'cmd' },
  { name: 'Defender Exclusions', script: 'Get-MpPreference | Select-Object -ExpandProperty ExclusionPath', category: 'Red Team — Windows', type: 'powershell' },
  { name: 'SUID Binaries', script: 'find / -perm -4000 -type f 2>/dev/null', category: 'Red Team — Linux', type: 'bash' },
  { name: 'SSH Keys Hunt', script: 'find / -name "id_rsa" -o -name "id_ed25519" -o -name "*.pem" 2>/dev/null', category: 'Red Team — Linux', type: 'bash' },
  { name: 'Cron Jobs', script: 'crontab -l; ls -la /etc/cron*', category: 'Red Team — Linux', type: 'bash' },
]

const filteredTemplates = computed(() => {
  if (!templateSearch.value) return TEMPLATES
  const q = templateSearch.value.toLowerCase()
  return TEMPLATES.filter(t => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
})

const templateCategories = computed(() => {
  const cats = new Map<string, Template[]>()
  for (const t of filteredTemplates.value) {
    if (!cats.has(t.category)) cats.set(t.category, [])
    cats.get(t.category)!.push(t)
  }
  return cats
})

const filteredScripts = computed(() => {
  if (!searchQuery.value) return scripts.value
  const q = searchQuery.value.toLowerCase()
  return scripts.value.filter(s => s.name.toLowerCase().includes(q))
})

const filteredClients = computed(() => {
  return clients.value.filter(c => {
    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase()
      return c.host.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || (c.nickname || '').toLowerCase().includes(q)
    }
    return true
  })
})

async function loadScripts() {
  loading.value = true
  try {
    const data = await api.get<{ items: Script[] }>('/api/saved-scripts')
    scripts.value = data.items || []
  } catch (e: any) { error.value = e.message || 'Failed to load scripts' }
  finally { loading.value = false }
}

async function loadClients() {
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {}
}

async function loadAutoTasks() {
  try {
    const data = await api.get<{ items: AutoTask[] }>('/api/auto-scripts')
    autoTasks.value = data.items || []
  } catch {}
}

function selectScript(script: Script) {
  selectedScriptId.value = script.id
  editorContent.value = script.content
  scriptName.value = script.name
  scriptType.value = script.scriptType || 'powershell'
  if (monacoInstance) {
    monacoInstance.setValue(script.content)
  }
}

function applyTemplate(t: Template) {
  editorContent.value = t.script
  scriptType.value = t.type
  if (monacoInstance) monacoInstance.setValue(t.script)
  showTemplates.value = false
}

async function createScript() {
  error.value = ''
  try {
    const data = await api.post<{ ok: boolean; item: Script }>('/api/saved-scripts', {
      name: 'Untitled Script', content: '# New script', scriptType: scriptType.value
    })
    await loadScripts()
    if (data.item) selectScript(data.item)
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function saveScript() {
  if (!selectedScriptId.value) return
  saving.value = true; error.value = ''
  try {
    await api.post('/api/saved-scripts', {
      id: selectedScriptId.value, name: scriptName.value,
      content: editorContent.value, scriptType: scriptType.value
    })
    success.value = 'Saved'
    await loadScripts()
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { saving.value = false }
}

async function deleteScript(id: string) {
  try {
    await api.delete(`/api/saved-scripts/${id}`)
    if (selectedScriptId.value === id) { selectedScriptId.value = null; editorContent.value = ''; scriptName.value = '' }
    await loadScripts()
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function executeScript() {
  if (selectedClients.value.length === 0 || !editorContent.value) return
  executing.value = true; error.value = ''; outputLines.value = []
  try {
    for (const cid of selectedClients.value) {
      try {
        await api.post(`/api/clients/${cid}/command`, { action: 'script_exec', script: editorContent.value, scriptType: scriptType.value })
        const c = clients.value.find(x => x.id === cid)
        outputLines.value.push({ host: c?.nickname || c?.host || cid, ok: true, detail: 'Sent' })
      } catch (e: any) {
        const c = clients.value.find(x => x.id === cid)
        outputLines.value.push({ host: c?.nickname || c?.host || cid, ok: false, detail: e.message || 'Failed' })
      }
    }
    success.value = `Script sent to ${selectedClients.value.length} client(s)`
    showExecute.value = false; selectedClients.value = []
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { executing.value = false }
}

async function createAutoTask() {
  error.value = ''
  try {
    await api.post('/api/auto-scripts', {
      name: scriptName.value || 'Auto Task',
      trigger: autoTaskTrigger.value,
      script: editorContent.value,
      scriptType: scriptType.value,
      enabled: true,
      osFilter: autoTaskOsFilter.value
    })
    await loadAutoTasks()
    success.value = 'Auto task created'
    autoTaskTrigger.value = 'on_connect'
    autoTaskOsFilter.value = []
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function toggleAutoTask(task: AutoTask) {
  try {
    await api.put(`/api/auto-scripts/${task.id}`, { enabled: !task.enabled })
    task.enabled = !task.enabled
  } catch (e: any) { error.value = e.message || 'Failed' }
}

function toggleAutoTaskOsFilter(os: string) {
  const idx = autoTaskOsFilter.value.indexOf(os)
  if (idx >= 0) autoTaskOsFilter.value.splice(idx, 1)
  else autoTaskOsFilter.value.push(os)
}

async function deleteAutoTask(id: string) {
  try {
    await api.delete(`/api/auto-scripts/${id}`)
    autoTasks.value = autoTasks.value.filter(t => t.id !== id)
  } catch (e: any) { error.value = e.message || 'Failed' }
}

function toggleClient(id: string) {
  const idx = selectedClients.value.indexOf(id)
  if (idx >= 0) selectedClients.value.splice(idx, 1); else selectedClients.value.push(id)
}

function langMode() {
  const map: Record<string, string> = { powershell: 'powershell', bash: 'shell', sh: 'shell', cmd: 'bat', python: 'python' }
  return map[scriptType.value] || 'plaintext'
}

async function loadMonaco() {
  if ((window as any).monaco) { initEditor(); return }
  monacoLoading.value = true
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js'
  script.onload = () => {
    (window as any).require = (window as any).require || {}
    ;(window as any).require.paths = { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
    ;(window as any).require(['vs/editor/editor.main'], () => { monacoReady.value = true; monacoLoading.value = false; initEditor() })
  }
  script.onerror = () => { monacoLoading.value = false }
  document.head.appendChild(script)
}

function initEditor() {
  const container = document.getElementById('monaco-editor')
  if (!container || !(window as any).monaco) return
  if (monacoInstance) monacoInstance.dispose()
  monacoInstance = (window as any).monaco.editor.create(container, {
    value: editorContent.value,
    language: langMode(),
    theme: 'vs-dark',
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    automaticLayout: true,
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    padding: { top: 12, bottom: 12 },
    renderLineHighlight: 'all',
    tabSize: 2,
    insertSpaces: true,
    lineNumbers: 'on',
  })
  monacoInstance.onDidChangeModelContent(() => {
    editorContent.value = monacoInstance.getValue()
  })
}

watch(scriptType, () => {
  if (monacoInstance && (window as any).monaco) {
    const model = monacoInstance.getModel()
    if (model) (window as any).monaco.editor.setModelLanguage(model, langMode())
  }
})

watch(selectedScriptId, () => {
  nextTick(() => {
    if (mode.value === 'code') {
      setTimeout(initEditor, 100)
    }
  })
})

onMounted(() => {
  loadScripts(); loadClients(); loadAutoTasks(); loadMonaco()
})
onUnmounted(() => { if (monacoInstance) monacoInstance.dispose() })
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-code" style="margin-right:8px;color:#22d3ee"></i>Scripts</h1>
      <div style="display:flex;gap:8px">
        <button @click="showTemplates = !showTemplates" class="btn btn-ghost btn-sm"><i class="fa-solid fa-book"></i>Templates</button>
        <button @click="createScript" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i>New Script</button>
        <button v-if="selectedScriptId" @click="showExecute = true; loadClients()" class="btn btn-success btn-sm"><i class="fa-solid fa-play"></i>Execute</button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div v-if="showTemplates" class="panel" style="margin-bottom:16px;max-height:400px;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">Script Templates</h2>
        <button @click="showTemplates = false" class="btn-icon-sm"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <input v-model="templateSearch" placeholder="Search templates..." class="input" style="width:100%;margin-bottom:12px" />
      <div v-for="[cat, templates] in templateCategories" :key="cat" style="margin-bottom:12px">
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;color:#64748b;margin-bottom:6px">{{ cat }}</h3>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          <button v-for="t in templates" :key="t.name" @click="applyTemplate(t)" class="btn btn-ghost btn-sm" style="font-size:11px">
            <i class="fa-solid fa-file-code" style="margin-right:4px"></i>{{ t.name }}
          </button>
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:240px 1fr;gap:16px;height:calc(100vh - 220px)">
      <div class="panel" style="display:flex;flex-direction:column;padding:0">
        <div style="padding:10px;border-bottom:1px solid var(--cv-border)">
          <input v-model="searchQuery" placeholder="Search scripts..." class="input" style="width:100%;padding:7px 10px;font-size:12px" />
        </div>
        <div style="flex:1;overflow-y:auto">
          <div v-if="loading" class="loading-state" style="padding:20px"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <div v-else-if="filteredScripts.length===0" class="empty-state" style="padding:20px">No scripts</div>
          <button v-for="s in filteredScripts" :key="s.id" @click="selectScript(s)" :style="{width:'100%',textAlign:'left',padding:'10px 12px',borderBottom:'1px solid var(--cv-border)',border:'none',borderLeft: selectedScriptId===s.id ? '2px solid #6366f1' : '2px solid transparent',background: selectedScriptId===s.id ? 'rgba(99,102,241,0.1)' : 'transparent',cursor:'pointer',transition:'all 100ms'}">
            <div style="font-size:13px;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ s.name }}</div>
            <div style="font-size:11px;color:#64748b;margin-top:2px;display:flex;gap:6px">
              <span>{{ s.scriptType }}</span>
              <span>{{ new Date(s.updatedAt).toLocaleDateString() }}</span>
            </div>
          </button>
        </div>
        <div v-if="autoTasks.length" style="border-top:1px solid var(--cv-border);padding:10px">
          <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em">Auto Tasks</div>
          <div v-for="t in autoTasks" :key="t.id" style="display:flex;align-items:center;gap:6px;padding:4px 0;font-size:11px">
            <button type="button" class="toggle" :class="{active:t.enabled}" @click="toggleAutoTask(t)" style="transform:scale(0.7)"></button>
            <div style="flex:1;min-width:0">
              <div style="color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ t.name }}</div>
              <div style="color:#475569;font-size:10px;text-transform:capitalize">{{ t.trigger?.replace(/_/g, ' ') }}</div>
            </div>
            <button @click="deleteAutoTask(t.id)" class="btn-icon-sm" style="width:20px;height:20px"><i class="fa-solid fa-trash" style="font-size:8px"></i></button>
          </div>
        </div>
      </div>

      <div class="panel" style="display:flex;flex-direction:column;padding:0;background:#020617">
        <template v-if="selectedScriptId">
          <div style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--cv-border)">
            <input v-model="scriptName" class="input" style="flex:1;padding:6px 10px;font-size:13px" />
            <AppSelect v-model="scriptType" :options="SCRIPT_TYPES.map(st => ({ value: st.value, label: st.label }))" size="sm" style="width:140px" />
            <div style="display:flex;gap:4px">
              <button @click="mode='code'" :class="mode==='code' ? 'btn-primary' : 'btn-ghost'" class="btn btn-sm" style="padding:5px 8px"><i class="fa-solid fa-code"></i></button>
            </div>
            <button @click="saveScript" :disabled="saving" class="btn btn-primary btn-sm">
              <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-save"></i>Save
            </button>
            <button @click="showAutoTask = true" class="btn btn-ghost btn-sm" title="Create auto-task"><i class="fa-solid fa-clock"></i></button>
            <button @click="deleteScript(selectedScriptId!)" class="btn btn-danger btn-sm" style="padding:5px 8px"><i class="fa-solid fa-trash"></i></button>
          </div>
          <div v-if="mode === 'code'" id="monaco-editor" v-show="monacoReady" style="flex:1;min-height:0"></div>
          <textarea v-if="mode === 'code' && !monacoReady" v-model="editorContent" style="flex:1;padding:14px;background:transparent;color:#e2e8f0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;border:none;resize:none;outline:none;width:100%" spellcheck="false" placeholder="Write your script here..."></textarea>
          <textarea v-if="mode !== 'code'" v-model="editorContent" style="flex:1;padding:14px;background:transparent;color:#e2e8f0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px;border:none;resize:none;outline:none;width:100%" spellcheck="false"></textarea>
        </template>
        <div v-else class="empty-state" style="flex:1;display:flex;align-items:center;justify-content:center">Select a script or create a new one</div>
      </div>
    </div>

    <div v-if="outputLines.length" class="panel" style="margin-top:16px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">Output</h2>
        <button @click="outputLines = []" class="btn btn-ghost" style="padding:3px 6px;font-size:11px">Clear</button>
      </div>
      <div style="max-height:200px;overflow-y:auto;font-family:ui-monospace,monospace;font-size:11px">
        <div v-for="(l, i) in outputLines" :key="i" style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--cv-border)">
          <i :class="l.ok ? 'fa-solid fa-check-circle' : 'fa-solid fa-xmark-circle'" :style="{color: l.ok ? '#86efac' : '#fca5a5',fontSize:'11px',marginTop:'2px'}"></i>
          <span style="color:#e2e8f0;font-weight:500">{{ l.host }}</span>
          <span style="color:#64748b">{{ l.detail }}</span>
        </div>
      </div>
    </div>

    <div v-if="showExecute" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showExecute = false">
      <div class="panel" style="width:420px;max-height:70vh;display:flex;flex-direction:column">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:12px">Execute on Clients</h2>
        <div style="flex:1;overflow-y:auto;margin-bottom:12px">
          <label v-for="c in filteredClients" :key="c.id" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:13px;transition:background 100ms" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background=''">
            <input type="checkbox" :checked="selectedClients.includes(c.id)" @change="toggleClient(c.id)" style="accent-color:#6366f1" />
            <span class="status-dot status-dot-online" style="width:6px;height:6px"></span>
            <span style="color:#e2e8f0">{{ c.nickname || c.host }}</span>
          </label>
          <div v-if="filteredClients.length===0" class="empty-state" style="padding:16px">No online clients</div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button @click="showExecute = false" class="btn btn-sm">Cancel</button>
          <button @click="executeScript" :disabled="selectedClients.length===0||executing" class="btn btn-success btn-sm">
            <i v-if="executing" class="fa-solid fa-spinner fa-spin"></i>Run ({{ selectedClients.length }})
          </button>
        </div>
      </div>
    </div>

    <div v-if="showAutoTask" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showAutoTask = false">
      <div class="panel" style="width:460px;max-height:80vh;overflow-y:auto">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:14px"><i class="fa-solid fa-clock" style="margin-right:6px;color:#6366f1"></i>Create Auto Task</h2>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Task Name</label>
            <input v-model="scriptName" class="input" style="width:100%" placeholder="Auto Task" />
          </div>
          <div>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:6px">Trigger Timing</label>
            <div style="display:flex;flex-direction:column;gap:6px">
              <button v-for="tr in TRIGGER_OPTIONS" :key="tr.value" type="button" @click="autoTaskTrigger = tr.value" :style="{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'8px',cursor:'pointer',fontSize:'12px',textAlign:'left',width:'100%',background: autoTaskTrigger===tr.value ? 'rgba(99,102,241,0.12)' : 'rgba(30,41,59,0.5)', border: '1px solid '+(autoTaskTrigger===tr.value ? 'rgba(99,102,241,0.35)' : 'rgba(51,65,85,0.4)'), color: autoTaskTrigger===tr.value ? '#e2e8f0' : '#94a3b8'}">
                <i :class="autoTaskTrigger===tr.value ? 'fa-solid fa-circle-dot' : 'fa-regular fa-circle'" :style="{color: autoTaskTrigger===tr.value ? '#6366f1' : '#475569', fontSize:'14px'}"></i>
                <div><div style="font-weight:500">{{ tr.label }}</div><div style="font-size:11px;color:#64748b;margin-top:1px">{{ tr.desc }}</div></div>
              </button>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:6px">OS Filter <span style="color:#64748b">(leave empty for all)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              <button v-for="os in OS_FILTER_OPTIONS" :key="os.value" type="button" @click="toggleAutoTaskOsFilter(os.value)" :style="{padding:'6px 10px',borderRadius:'6px',fontSize:'11px',cursor:'pointer',fontWeight:500,background: autoTaskOsFilter.includes(os.value) ? 'rgba(99,102,241,0.15)' : 'rgba(30,41,59,0.5)', border: '1px solid '+(autoTaskOsFilter.includes(os.value) ? 'rgba(99,102,241,0.35)' : 'rgba(51,65,85,0.4)'), color: autoTaskOsFilter.includes(os.value) ? '#e2e8f0' : '#94a3b8'}">
                {{ os.label }}
              </button>
            </div>
          </div>
          <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px;padding:8px 10px;font-size:11px;color:#64748b">
            <i class="fa-solid fa-info-circle" style="margin-right:4px"></i>
            Script type: <span style="color:#94a3b8">{{ scriptType }}</span>. Uses current editor content.
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">
          <button @click="showAutoTask = false" class="btn btn-sm">Cancel</button>
          <button @click="showAutoTask = false; createAutoTask()" :disabled="!editorContent" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus" style="margin-right:4px"></i>Create</button>
        </div>
      </div>
    </div>
  </div>
</template>
