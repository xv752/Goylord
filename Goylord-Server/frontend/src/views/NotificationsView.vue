<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface Notification {
  id: number; title: string; message: string; type: string; read: boolean; createdAt: string
}

const notifications = ref<Notification[]>([])
const loading = ref(true)
const liveConnected = ref(false)
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setInterval> | null = null

async function loadNotifications() {
  loading.value = true
  try {
    const data = await api.get<{ notifications: Notification[] }>('/api/notifications/config')
    notifications.value = data.notifications || []
  } catch {} finally { loading.value = false }
}

function connectWs() {
  try {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${location.host}/api/notifications/ws`)
    ws.onopen = () => { liveConnected.value = true }
    ws.onclose = () => { liveConnected.value = false; scheduleReconnect() }
    ws.onerror = () => { ws?.close() }
    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data)
        if (data.type === 'notification') {
          notifications.value.unshift({
            id: Date.now(), title: data.title || 'Notification',
            message: data.message || '', type: data.notificationType || 'info',
            read: false, createdAt: new Date().toISOString()
          })
        }
      } catch {}
    }
  } catch { scheduleReconnect() }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setInterval(() => {
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      clearInterval(reconnectTimer!); reconnectTimer = null; connectWs()
    }
  }, 5000)
}

async function markAsRead(id: number) {
  const n = notifications.value.find(x => x.id === id)
  if (n) n.read = true
  try { await api.post(`/api/notifications/${id}/read`) } catch {}
}

async function markAllRead() {
  notifications.value.forEach(n => { n.read = true })
  try { await api.post('/api/notifications/read-all') } catch {}
}

function typeIcon(type: string) {
  switch (type) {
    case 'error': return { icon: 'fa-solid fa-circle-exclamation', cls: 'badge-danger' }
    case 'warning': return { icon: 'fa-solid fa-triangle-exclamation', cls: 'badge-warning' }
    case 'success': return { icon: 'fa-solid fa-circle-check', cls: 'badge-success' }
    default: return { icon: 'fa-solid fa-circle-info', cls: 'badge-info' }
  }
}

function unreadCount() { return notifications.value.filter(n => !n.read).length }

onMounted(() => { loadNotifications(); connectWs() })
onUnmounted(() => { ws?.close(); if (reconnectTimer) clearInterval(reconnectTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <h1 class="section-title">Notifications</h1>
        <span :class="['badge', 'badge-sm', liveConnected ? 'badge-success' : '']" :style="!liveConnected ? { background:'rgba(71,85,105,0.3)', color:'#94a3b8', borderColor:'rgba(71,85,105,0.55)' } : {}">
          <span :class="['status-dot', liveConnected ? 'status-dot-online' : 'status-dot-offline']" style="width:6px;height:6px"></span>
          {{ liveConnected ? 'Live' : 'Offline' }}
        </span>
      </div>
      <div style="display:flex;gap:8px">
        <button v-if="unreadCount() > 0" @click="markAllRead" class="btn btn-sm">Mark all read</button>
        <button @click="loadNotifications" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
      </div>
    </div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    <div v-else-if="notifications.length === 0" class="empty-state">No notifications</div>

    <div v-else style="display:flex;flex-direction:column;gap:8px">
      <div
        v-for="n in notifications" :key="n.id"
        class="panel"
        :style="{ opacity: n.read ? 0.6 : 1 }"
        style="display:flex;align-items:flex-start;gap:14px;padding:14px 16px"
      >
        <i :class="typeIcon(n.type).icon" :style="{ color: typeIcon(n.type).cls === 'badge-danger' ? '#fca5a5' : typeIcon(n.type).cls === 'badge-warning' ? '#fcd34d' : typeIcon(n.type).cls === 'badge-success' ? '#4ade80' : '#93c5fd' }"></i>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:0.875rem;font-weight:500;color:#e2e8f0">{{ n.title }}</span>
            <span v-if="!n.read" style="width:6px;height:6px;border-radius:50%;background:#6366f1"></span>
          </div>
          <p style="font-size:0.875rem;color:#94a3b8;margin:4px 0 0">{{ n.message }}</p>
          <span style="font-size:12px;color:#64748b;margin-top:6px;display:block">{{ new Date(n.createdAt).toLocaleString() }}</span>
        </div>
        <button v-if="!n.read" @click="markAsRead(n.id)" class="btn-icon-sm" title="Mark read">
          <i class="fa-solid fa-check" style="font-size:11px"></i>
        </button>
      </div>
    </div>
  </div>
</template>
