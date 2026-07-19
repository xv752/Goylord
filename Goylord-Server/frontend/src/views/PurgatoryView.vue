<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface PendingAgent {
  id: number; hostname: string; username: string; os: string; ip: string; createdAt: string
}
interface Stats { pending: number; total: number }

const agents = ref<PendingAgent[]>([])
const stats = ref<Stats>({ pending: 0, total: 0 })
const loading = ref(true)
const processing = ref<number | null>(null)
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadPending() {
  try {
    const [listData, statsData] = await Promise.all([
      api.get<PendingAgent[]>('/api/enrollment/list'),
      api.get<Stats>('/api/enrollment/stats')
    ])
    agents.value = listData; stats.value = statsData
  } catch {} finally { loading.value = false }
}

async function approveAgent(id: number) {
  processing.value = id
  try { await api.post(`/api/enrollment/${id}/approve`); await loadPending() } catch {} finally { processing.value = null }
}
async function denyAgent(id: number) {
  processing.value = id
  try { await api.post(`/api/enrollment/${id}/deny`); await loadPending() } catch {} finally { processing.value = null }
}
async function approveAll() {
  processing.value = -1
  try { for (const agent of agents.value) await api.post(`/api/enrollment/${agent.id}/approve`); await loadPending() } catch {} finally { processing.value = null }
}

onMounted(() => { loadPending(); refreshTimer = setInterval(loadPending, 10000) })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:16px">
        <h1 class="section-title">Purgatory</h1>
        <span class="badge badge-sm" style="background:rgba(245,158,11,0.08);color:#fcd34d;border-color:rgba(245,158,11,0.20)">
          <span class="status-dot status-dot-online" style="width:6px;height:6px"></span>
          Auto-refreshing
        </span>
      </div>
      <button @click="loadPending" class="btn btn-sm"><i class="fa-solid fa-rotate" style="margin-right:6px"></i>Refresh</button>
    </div>

    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-bottom:24px">
      <div class="panel">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Pending Approval</div>
        <div style="font-size:1.5rem;font-weight:600;color:#fcd34d">{{ stats.pending }}</div>
      </div>
      <div class="panel">
        <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">Total Agents</div>
        <div style="font-size:1.5rem;font-weight:600;color:#e8edf2">{{ stats.total }}</div>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-bottom:16px">
      <button v-if="agents.length > 0" @click="approveAll" :disabled="processing === -1" class="btn btn-success btn-sm">
        <i v-if="processing === -1" class="fa-solid fa-spinner fa-spin"></i>
        <i v-else class="fa-solid fa-check-double"></i>
        Approve All ({{ agents.length }})
      </button>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Hostname</th>
            <th>Username</th>
            <th>OS</th>
            <th>IP</th>
            <th>Created</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="6" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td>
          </tr>
          <tr v-else-if="agents.length === 0">
            <td colspan="6" class="empty-state">No pending agents</td>
          </tr>
          <tr v-for="agent in agents" :key="agent.id">
            <td style="font-weight:500;color:#e2e8f0">{{ agent.hostname }}</td>
            <td>{{ agent.username }}</td>
            <td>{{ agent.os }}</td>
            <td style="font-size:12px;font-family:ui-monospace,monospace;color:#64748b">{{ agent.ip }}</td>
            <td style="font-size:12px;color:#64748b">{{ new Date(agent.createdAt).toLocaleString() }}</td>
            <td style="text-align:right">
              <button @click="approveAgent(agent.id)" :disabled="processing === agent.id" class="btn btn-success btn-sm" style="padding:5px 10px;font-size:12px;margin-right:6px">
                <i v-if="processing === agent.id" class="fa-solid fa-spinner fa-spin"></i>
                <i v-else class="fa-solid fa-check"></i> Approve
              </button>
              <button @click="denyAgent(agent.id)" :disabled="processing === agent.id" class="btn btn-danger btn-sm" style="padding:5px 10px;font-size:12px">
                <i v-if="processing === agent.id" class="fa-solid fa-spinner fa-spin"></i>
                <i v-else class="fa-solid fa-xmark"></i> Deny
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
