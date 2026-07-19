<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface LogEntry {
  id: number; username: string; action: string; detail: string; ip: string; createdAt: string
}

const logs = ref<LogEntry[]>([])
const loading = ref(true)
const page = ref(1)
const total = ref(0)
const limit = 50
const search = ref('')
const autoRefresh = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadLogs() {
  loading.value = true
  try {
    const params = new URLSearchParams({ page: String(page.value), limit: String(limit) })
    if (search.value) params.set('search', search.value)
    const data = await api.get<{ logs: LogEntry[]; total: number }>(`/api/audit-logs?${params}`)
    logs.value = data.logs || []
    total.value = data.total || 0
  } catch {} finally { loading.value = false }
}

const totalPages = computed(() => Math.ceil(total.value / limit))
function prevPage() { if (page.value > 1) { page.value--; loadLogs() } }
function nextPage() { if (page.value < totalPages.value) { page.value++; loadLogs() } }
function doSearch() { page.value = 1; loadLogs() }
function toggleAutoRefresh() {
  autoRefresh.value = !autoRefresh.value
  if (autoRefresh.value) refreshTimer = setInterval(loadLogs, 10000)
  else if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
}
function actionBadge(action: string) {
  if (action.includes('login')) return 'badge-info'
  if (action.includes('delete')) return 'badge-danger'
  if (action.includes('create')) return 'badge-success'
  if (action.includes('update') || action.includes('edit')) return 'badge-warning'
  return 'badge'
}

onMounted(loadLogs)
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title">Audit Logs</h1>
      <div style="display:flex;align-items:center;gap:12px">
        <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;color:#94a3b8;cursor:pointer">
          <input type="checkbox" :checked="autoRefresh" @change="toggleAutoRefresh" style="accent-color:#6366f1" />
          Auto-refresh
        </label>
        <button @click="loadLogs" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-bottom:16px">
      <div style="flex:1;position:relative">
        <input v-model="search" @keydown.enter="doSearch" placeholder="Search logs..." class="input" style="padding-left:36px;width:100%" />
        <i class="fa-solid fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#64748b;font-size:13px"></i>
      </div>
      <button @click="doSearch" class="btn btn-sm">Search</button>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>User</th>
            <th>Action</th>
            <th>Detail</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td>
          </tr>
          <tr v-else-if="logs.length === 0">
            <td colspan="5" class="empty-state">No logs found</td>
          </tr>
          <tr v-for="log in logs" :key="log.id">
            <td style="font-size:12px;color:#64748b;white-space:nowrap">{{ new Date(log.createdAt).toLocaleString() }}</td>
            <td style="color:#cbd5e1">{{ log.username }}</td>
            <td><span :class="['badge', 'badge-sm', actionBadge(log.action)]">{{ log.action }}</span></td>
            <td style="font-size:12px;color:#94a3b8;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ log.detail }}</td>
            <td style="font-size:12px;color:#64748b;font-family:ui-monospace,monospace">{{ log.ip }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="totalPages > 1" class="pagination">
      <span class="pagination-info">Page {{ page }} of {{ totalPages }} ({{ total }} total)</span>
      <div class="pagination-btns" style="display:flex;gap:8px">
        <button @click="prevPage" :disabled="page <= 1" class="btn btn-sm"><i class="fa-solid fa-chevron-left" style="margin-right:4px"></i>Prev</button>
        <button @click="nextPage" :disabled="page >= totalPages" class="btn btn-sm">Next<i class="fa-solid fa-chevron-right" style="margin-left:4px"></i></button>
      </div>
    </div>
  </div>
</template>
