<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface PendingAgent {
  id: string; hostname: string; user: string; os: string; ip: string; createdAt: string
  cpu?: string; gpu?: string; ram?: string; country?: string; suspiciousFlags?: string[]
}
interface Stats { total: number; pending: number; approved: number; denied: number }
interface BannedIp { ip: string; reason?: string; createdAt: string }

const agents = ref<PendingAgent[]>([])
const bannedIps = ref<BannedIp[]>([])
const stats = ref<Stats>({ total: 0, pending: 0, approved: 0, denied: 0 })
const loading = ref(true)
const activeTab = ref<'pending' | 'approved' | 'denied' | 'banned'>('pending')
const searchQuery = ref('')
const selectedIds = ref<string[]>([])
const processing = ref<string | null>(null)
const page = ref(1)
const pageSize = ref(50)
const showBanModal = ref(false)
const banTarget = ref<{ id: string; ip: string } | null>(null)
const banReason = ref('')
const showBulkBanModal = ref(false)
const bulkBanIps = ref<string[]>([])
const requireApproval = ref(true)
const autoApproveSuspicious = ref(false)
const error = ref('')
const success = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null

async function loadAll() {
  loading.value = true
  try {
    const [statsData, pendingData, bannedData, settingsData] = await Promise.all([
      api.get<Stats>('/api/enrollment/stats').catch(() => ({ total: 0, pending: 0, approved: 0, denied: 0 })),
      api.get<{ items: PendingAgent[] }>('/api/enrollment/pending').catch(() => ({ items: [] })),
      api.get<{ items: BannedIp[] }>('/api/enrollment/banned-ips').catch(() => ({ items: [] })),
      api.get<{ requireApproval: boolean; autoApproveUnlessSuspicious: boolean }>('/api/enrollment/settings').catch(() => ({ requireApproval: true, autoApproveUnlessSuspicious: false })),
    ])
    stats.value = statsData; agents.value = pendingData.items || []; bannedIps.value = bannedData.items || []
    requireApproval.value = settingsData.requireApproval; autoApproveSuspicious.value = settingsData.autoApproveUnlessSuspicious
  } catch {} finally { loading.value = false }
}

const filteredAgents = computed(() => {
  if (!searchQuery.value) return agents.value
  const q = searchQuery.value.toLowerCase()
  return agents.value.filter(a =>
    a.hostname?.toLowerCase().includes(q) || a.user?.toLowerCase().includes(q) || a.ip?.includes(q) ||
    a.os?.toLowerCase().includes(q) || a.id?.toLowerCase().includes(q)
  )
})

async function approve(id: string) {
  processing.value = id; error.value = ''
  try { await api.post(`/api/enrollment/${id}/approve`); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function deny(id: string, reason?: string) {
  processing.value = id; error.value = ''
  try { await api.post(`/api/enrollment/${id}/deny`, { reason }); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function resetAgent(id: string) {
  processing.value = id; error.value = ''
  try { await api.post(`/api/enrollment/${id}/reset`); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function deleteAgent(id: string) {
  if (!confirm('Delete this client permanently?')) return
  processing.value = id; error.value = ''
  try { await api.delete(`/api/enrollment/${id}`); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function banIp(id: string, ip: string) {
  banTarget.value = { id, ip }; banReason.value = ''
}
async function confirmBan() {
  if (!banTarget.value) return
  processing.value = banTarget.value.id; error.value = ''
  try { await api.post(`/api/enrollment/${banTarget.value.id}/ban-ip`); showBanModal.value = false; await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null; banTarget.value = null }
}
async function approveAll() {
  processing.value = 'bulk'; error.value = ''
  try { await api.post('/api/enrollment/bulk', { ids: filteredAgents.value.map(a => a.id), action: 'approve' }); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function denyAll() {
  processing.value = 'bulk'; error.value = ''
  try { await api.post('/api/enrollment/bulk', { ids: filteredAgents.value.map(a => a.id), action: 'deny' }); await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function bulkBan() {
  const ips = [...new Set(filteredAgents.value.map(a => a.ip).filter(Boolean))]
  if (ips.length === 0) return
  bulkBanIps.value = ips; showBulkBanModal.value = true
}
async function confirmBulkBan() {
  processing.value = 'bulk'; error.value = ''
  try { await api.post('/api/enrollment/bulk', { ids: filteredAgents.value.map(a => a.id), action: 'ban-ip' }); showBulkBanModal.value = false; await loadAll() }
  catch (e: any) { error.value = e.message } finally { processing.value = null }
}
async function unbanIp(ip: string) {
  try { await api.delete(`/api/enrollment/banned-ips?ip=${encodeURIComponent(ip)}`); await loadAll() }
  catch (e: any) { error.value = e.message }
}
async function toggleSettings() {
  try {
    await api.post('/api/enrollment/settings', { requireApproval: !requireApproval.value, autoApproveUnlessSuspicious: autoApproveSuspicious.value })
    requireApproval.value = !requireApproval.value
  } catch (e: any) { error.value = e.message }
}
async function toggleSuspicious() {
  try {
    await api.post('/api/enrollment/settings', { requireApproval: requireApproval.value, autoApproveUnlessSuspicious: autoApproveSuspicious.value })
  } catch (e: any) { error.value = e.message }
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id)
  if (idx >= 0) selectedIds.value.splice(idx, 1); else selectedIds.value.push(id)
}
function selectAll() {
  const ids = filteredAgents.value.map(a => a.id)
  if (selectedIds.value.length === ids.length) selectedIds.value = []; else selectedIds.value = [...ids]
}

onMounted(() => { loadAll(); refreshTimer = setInterval(loadAll, 15000) })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <h1 class="section-title"><i class="fa-solid fa-user-clock" style="margin-right:8px;color:#fbbf24"></i>Purgatory</h1>
        <span class="badge badge-sm"><span class="status-dot status-dot-online" style="width:6px;height:6px"></span>Auto-refresh</span>
      </div>
      <button @click="loadAll" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      <div class="panel" style="cursor:pointer" @click="activeTab='pending'">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Pending</div>
        <div style="font-size:20px;font-weight:600;color:#fbbf24">{{ stats.pending }}</div>
      </div>
      <div class="panel" style="cursor:pointer" @click="activeTab='approved'">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Approved</div>
        <div style="font-size:20px;font-weight:600;color:#86efac">{{ stats.approved }}</div>
      </div>
      <div class="panel" style="cursor:pointer" @click="activeTab='denied'">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Denied</div>
        <div style="font-size:20px;font-weight:600;color:#fca5a5">{{ stats.denied }}</div>
      </div>
      <div class="panel" style="cursor:pointer" @click="activeTab='banned'">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Banned IPs</div>
        <div style="font-size:20px;font-weight:600;color:#fb923c">{{ bannedIps.length }}</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:8px">
        <button type="button" class="toggle" :class="{active: !requireApproval}" @click="toggleSettings"></button>
        <span style="font-size:13px;color:#cbd5e1">Always Allow</span>
      </div>
      <div v-if="!requireApproval" style="display:flex;align-items:center;gap:8px">
        <button type="button" class="toggle" :class="{active: autoApproveSuspicious}" @click="autoApproveSuspicious = !autoApproveSuspicious; toggleSuspicious()"></button>
        <span style="font-size:12px;color:#94a3b8">Unless Suspicious</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <input v-model="searchQuery" placeholder="Search..." class="input" style="flex:1;max-width:300px" />
      <template v-if="activeTab === 'pending' && filteredAgents.length > 0">
        <button @click="selectAll" class="btn btn-ghost btn-sm">{{ selectedIds.length === filteredAgents.length ? 'Deselect' : 'Select All' }}</button>
        <span style="font-size:11px;color:#64748b">{{ selectedIds.length }} selected</span>
        <button @click="approveAll" :disabled="processing==='bulk'" class="btn btn-success btn-sm">
          <i v-if="processing==='bulk'" class="fa-solid fa-spinner fa-spin"></i>Approve All ({{ filteredAgents.length }})
        </button>
        <button @click="denyAll" :disabled="processing==='bulk'" class="btn btn-danger btn-sm">Deny All</button>
      </template>
    </div>

    <div class="table-wrap" v-if="activeTab !== 'banned'">
      <table class="data-table">
        <thead>
          <tr>
            <th v-if="activeTab==='pending'" style="width:30px"><input type="checkbox" :checked="selectedIds.length===filteredAgents.length && filteredAgents.length>0" @change="selectAll" style="accent-color:#6366f1" /></th>
            <th>Hostname</th>
            <th>User</th>
            <th>OS</th>
            <th>IP</th>
            <th v-if="filteredAgents.some(a=>a.cpu)">CPU/GPU</th>
            <th>Created</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td :colspan="activeTab==='pending'?8:7" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td></tr>
          <tr v-else-if="filteredAgents.length===0"><td :colspan="activeTab==='pending'?8:7" class="empty-state">No {{ activeTab }} agents</td></tr>
          <tr v-for="a in filteredAgents" :key="a.id">
            <td v-if="activeTab==='pending'"><input type="checkbox" :checked="selectedIds.includes(a.id)" @change="toggleSelect(a.id)" style="accent-color:#6366f1" /></td>
            <td style="font-weight:500;color:#e2e8f0">{{ a.hostname }}
              <span v-if="a.suspiciousFlags?.length" class="badge badge-sm badge-warning" style="margin-left:6px;font-size:9px">{{ a.suspiciousFlags.length }} flags</span>
            </td>
            <td style="color:#94a3b8">{{ a.user }}</td>
            <td style="font-size:12px;color:#94a3b8">{{ a.os }}</td>
            <td style="font-family:ui-monospace,monospace;font-size:11px;color:#64748b">{{ a.ip }}</td>
            <td v-if="filteredAgents.some(x=>x.cpu)" style="font-size:11px;color:#64748b">{{ a.cpu || '' }} {{ a.gpu || '' }}</td>
            <td style="font-size:11px;color:#64748b;white-space:nowrap">{{ new Date(a.createdAt).toLocaleString() }}</td>
            <td style="text-align:right;white-space:nowrap">
              <template v-if="activeTab==='pending'">
                <button @click="approve(a.id)" :disabled="processing===a.id" class="btn btn-success btn-sm" style="padding:4px 8px;font-size:11px;margin-right:4px">
                  <i v-if="processing===a.id" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-check"></i> Approve
                </button>
                <button @click="deny(a.id)" :disabled="processing===a.id" class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px;margin-right:4px">
                  <i class="fa-solid fa-xmark"></i> Deny
                </button>
                <button @click="banIp(a.id, a.ip)" class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:11px"><i class="fa-solid fa-ban"></i></button>
              </template>
              <template v-if="activeTab==='approved'||activeTab==='denied'">
                <button @click="resetAgent(a.id)" class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:11px"><i class="fa-solid fa-rotate"></i> Reset</button>
                <button @click="deleteAgent(a.id)" class="btn btn-danger btn-sm" style="padding:4px 8px;font-size:11px;margin-left:4px"><i class="fa-solid fa-trash"></i></button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="activeTab === 'banned'" class="panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">Banned IPs</h2>
      </div>
      <div v-if="bannedIps.length===0" class="empty-state">No banned IPs</div>
      <div v-else style="display:flex;flex-direction:column;gap:6px">
        <div v-for="b in bannedIps" :key="b.ip" style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:8px">
          <i class="fa-solid fa-ban" style="color:#fb923c;font-size:12px"></i>
          <span style="font-family:ui-monospace,monospace;font-size:12px;color:#e2e8f0">{{ b.ip }}</span>
          <span v-if="b.reason" style="font-size:11px;color:#64748b;flex:1">{{ b.reason }}</span>
          <span v-else style="flex:1"></span>
          <span style="font-size:11px;color:#64748b">{{ new Date(b.createdAt).toLocaleDateString() }}</span>
          <button @click="unbanIp(b.ip)" class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:11px"><i class="fa-solid fa-unlock"></i> Unban</button>
        </div>
      </div>
    </div>

    <div v-if="showBanModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showBanModal=false">
      <div class="panel" style="width:380px">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:10px">Ban IP</h2>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:10px">Ban IP <strong style="color:#e2e8f0">{{ banTarget?.ip }}</strong>?</p>
        <input v-model="banReason" placeholder="Reason (optional)" class="input" style="width:100%;margin-bottom:12px" />
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button @click="showBanModal=false" class="btn btn-sm">Cancel</button>
          <button @click="confirmBan" class="btn btn-danger btn-sm"><i class="fa-solid fa-ban" style="margin-right:4px"></i>Ban</button>
        </div>
      </div>
    </div>

    <div v-if="showBulkBanModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showBulkBanModal=false">
      <div class="panel" style="width:380px">
        <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:10px">Bulk Ban</h2>
        <p style="font-size:12px;color:#94a3b8;margin-bottom:10px">This will ban {{ bulkBanIps.length }} unique IP(s) and deny all matching clients.</p>
        <div style="display:flex;justify-content:flex-end;gap:8px">
          <button @click="showBulkBanModal=false" class="btn btn-sm">Cancel</button>
          <button @click="confirmBulkBan" class="btn btn-danger btn-sm">Confirm Ban</button>
        </div>
      </div>
    </div>
  </div>
</template>
