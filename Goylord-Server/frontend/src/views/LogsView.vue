<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface LogEntry {
  action: string; targetClientId?: string; details?: string; timestamp: string; ip?: string; username?: string
}

const logs = ref<LogEntry[]>([])
const loading = ref(true)
const page = ref(1)
const total = ref(0)
const limit = 50
const search = ref('')
const clientFilter = ref('')
const startDate = ref('')
const endDate = ref('')
const autoRefresh = ref(false)
const selectedActions = ref<string[]>(['first_connect', 'reconnect', 'disconnect', 'uninstall'])
let refreshTimer: ReturnType<typeof setInterval> | null = null

const ACTION_TYPES = [
  { value: 'first_connect', label: 'First Connect', color: '#86efac' },
  { value: 'reconnect', label: 'Reconnect', color: '#60a5fa' },
  { value: 'disconnect', label: 'Disconnect', color: '#fb923c' },
  { value: 'uninstall', label: 'Uninstall', color: '#fca5a5' },
]

const totalPages = computed(() => Math.ceil(total.value / limit))

async function loadLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), pageSize: String(limit) })
    if (search.value) params.set('q', search.value)
    if (clientFilter.value) params.set('clientId', clientFilter.value)
    if (startDate.value) params.set('startDate', String(new Date(startDate.value + 'T00:00:00').getTime()))
    if (endDate.value) params.set('endDate', String(new Date(endDate.value + 'T23:59:59').getTime()))
    if (selectedActions.value.length > 0) params.set('actions', selectedActions.value.join(','))
    const data = await api.get<{ total: number; logs: LogEntry[] }>(`/api/audit-logs?${params}`)
    logs.value = data.logs || []
    total.value = data.total || 0
  } catch {} finally { loading.value = false }
}

function prevPage() { if (page.value > 1) { page.value--; loadLogs() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; loadLogs() } }
function doSearch() { page.value = 1; loadLogs() }
function clearFilters() { search.value = ''; clientFilter.value = ''; startDate.value = ''; endDate.value = ''; selectedActions.value = ['first_connect', 'reconnect', 'disconnect', 'uninstall']; page.value = 1; loadLogs() }
function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) refreshTimer = setInterval(loadLogs, 10000)
  else if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}

function actionIcon(action: string) {
  if (action.includes('first_connect')) return { icon: 'fa-solid fa-plug-circle-plus', color: '#86efac' }
  if (action.includes('reconnect')) return { icon: 'fa-solid fa-rotate', color: '#60a5fa' }
  if (action.includes('disconnect')) return { icon: 'fa-solid fa-plug-circle-xmark', color: '#fb923c' }
  if (action.includes('uninstall')) return { icon: 'fa-solid fa-trash', color: '#fca5a5' }
  return { icon: 'fa-solid fa-circle-info', color: '#94a3b8' }
}

function actionLabel(action: string) {
  const map: Record<string, string> = { first_connect: 'First Connect', reconnect: 'Reconnect', disconnect: 'Disconnect', uninstall: 'Uninstall' }
  return map[action] || action
}

function actionBadgeClass(action: string) {
  if (action.includes('first_connect')) return 'badge-success'
  if (action.includes('reconnect')) return 'badge-info'
  if (action.includes('disconnect')) return 'badge-warning'
  if (action.includes('uninstall')) return 'badge-danger'
  return ''
}

function toggleAction(action: string) {
  const idx = selectedActions.value.indexOf(action)
  if (idx >= 0) selectedActions.value.splice(idx, 1); else selectedActions.value.push(action)
  page.value = 1; loadLogs()
}

let searchDebounce: ReturnType<typeof setTimeout> | null = null
function onSearchInput() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(doSearch, 300)
}

onMounted(loadLogs)
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); if (searchDebounce) clearTimeout(searchDebounce) })
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-clipboard-list" style="margin-right:8px;color:#fbbf24"></i>Audit Logs</h1>
      <div style="display:flex;align-items:center;gap:12px">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;cursor:pointer">
          <input type="checkbox" :checked="autoRefresh" @change="toggleAutoRefresh" style="accent-color:#6366f1" />
          Auto-refresh
        </label>
        <button @click="loadLogs" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px;position:relative">
        <input v-model="search" @input="onSearchInput" placeholder="Search logs..." class="input" style="width:100%;padding-left:32px" />
        <i class="fa-solid fa-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:#64748b;font-size:12px"></i>
      </div>
      <input v-model="clientFilter" @keydown.enter="doSearch" placeholder="Client ID..." class="input" style="width:160px" />
      <input v-model="startDate" type="date" @change="doSearch" class="input" style="width:150px" />
      <input v-model="endDate" type="date" @change="doSearch" class="input" style="width:150px" />
      <button @click="clearFilters" class="btn btn-sm"><i class="fa-solid fa-xmark" style="margin-right:4px"></i>Clear</button>
    </div>

    <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap">
      <button v-for="a in ACTION_TYPES" :key="a.value" @click="toggleAction(a.value)" class="badge badge-sm" :style="{cursor:'pointer', borderColor: selectedActions.includes(a.value) ? a.color + '44' : 'rgba(148,163,184,0.16)', background: selectedActions.includes(a.value) ? a.color + '12' : 'transparent', color: selectedActions.includes(a.value) ? a.color : '#64748b'}">
        <span :style="{width:'6px',height:'6px',borderRadius:'50%',background: selectedActions.includes(a.value) ? a.color : '#475569',display:'inline-block'}"></span>
        {{ a.label }}
      </button>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:40px"></th>
            <th>Action</th>
            <th>Client</th>
            <th>User</th>
            <th>Details</th>
            <th>IP</th>
            <th style="white-space:nowrap">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="7" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td>
          </tr>
          <tr v-else-if="logs.length === 0">
            <td colspan="7" class="empty-state">No logs found</td>
          </tr>
          <tr v-for="(log, i) in logs" :key="i">
            <td><i :class="actionIcon(log.action).icon" :style="{color: actionIcon(log.action).color, fontSize:'12px'}"></i></td>
            <td><span :class="['badge', 'badge-sm', actionBadgeClass(log.action)]">{{ actionLabel(log.action) }}</span></td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#94a3b8">{{ log.targetClientId ? log.targetClientId.slice(0,8) : '-' }}</td>
            <td style="color:#cbd5e1;font-size:12px">{{ log.username || '-' }}</td>
            <td style="font-size:11px;color:#94a3b8;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" :title="log.details">{{ log.details || '-' }}</td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#64748b">{{ log.ip || '-' }}</td>
            <td style="font-size:11px;color:#64748b;white-space:nowrap">{{ new Date(log.timestamp).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <span style="font-size:12px;color:#64748b">Page {{ page }} of {{ totalPages }} ({{ total }} events)</span>
      <div style="display:flex;gap:8px">
        <button @click="prevPage" :disabled="page<=1" class="btn btn-sm"><i class="fa-solid fa-chevron-left"></i> Prev</button>
        <button @click="nextPage" :disabled="page>=totalPages" class="btn btn-sm">Next <i class="fa-solid fa-chevron-right"></i></button>
      </div>
    </div>
  </div>
</template>
