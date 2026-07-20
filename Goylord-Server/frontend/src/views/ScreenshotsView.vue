<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface Client {
  id: string; host: string; nickname?: string; user: string; os: string; online: boolean
  hasThumbnail?: boolean; thumbnailVersion?: number; lastSeen?: number
}

const clients = ref<Client[]>([])
const loading = ref(true)
const search = ref('')
const showOffline = ref(false)
const tileSize = ref(200)
const lightboxClient = ref<Client | null>(null)
const page = ref(1)
const pageSize = 60
let refreshTimer: ReturnType<typeof setInterval> | null = null

const filteredClients = computed(() => {
  return clients.value.filter(c => {
    if (!showOffline.value && !c.online) return false
    if (search.value) {
      const q = search.value.toLowerCase()
      if (!c.host.toLowerCase().includes(q) && !(c.nickname || '').toLowerCase().includes(q) && !c.user.toLowerCase().includes(q)) return false
    }
    return true
  })
})

const totalPages = computed(() => Math.ceil(filteredClients.value.length / pageSize))
const pagedClients = computed(() => {
  const start = (page.value - 1) * pageSize
  return filteredClients.value.slice(start, start + pageSize)
})

const onlineCount = computed(() => filteredClients.value.filter(c => c.online).length)

async function loadClients() {
  loading.value = true
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999&sort=host_asc')
    clients.value = data.items || []
  } catch {} finally { loading.value = false }
}

function thumbnailUrl(client: Client) {
  return `/api/thumbnail/${client.id}?v=${client.thumbnailVersion || 0}`
}

function timeSince(ts?: number) {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function onImgError(e: Event) {
  const img = e.target as HTMLImageElement
  img.style.display = 'none'
}

onMounted(() => { loadClients(); refreshTimer = setInterval(loadClients, 15000) })
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <h1 class="section-title"><i class="fa-solid fa-images" style="margin-right:8px;color:#38bdf8"></i>Screenshot Wall</h1>
        <span class="badge badge-sm">{{ onlineCount }} online</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <input v-model="search" placeholder="Search..." class="input" style="width:200px;padding:6px 10px;font-size:12px" />
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#94a3b8;cursor:pointer">
          <input type="checkbox" v-model="showOffline" style="accent-color:#6366f1" />Offline
        </label>
        <AppSelect v-model="tileSize" :options="[{ value: 140, label: 'Small' }, { value: 200, label: 'Medium' }, { value: 280, label: 'Large' }]" size="sm" style="width:120px" />
        <button @click="loadClients" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
      </div>
    </div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading thumbnails...</div>
    <div v-else-if="pagedClients.length === 0" class="empty-state">
      <i class="fa-solid fa-camera" style="font-size:32px;color:#334155;display:block;margin-bottom:12px"></i>
      No screenshots available
    </div>
    <template v-else>
      <div :style="{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax('+tileSize+'px, 1fr))',gap:'10px'}">
        <div v-for="c in pagedClients" :key="c.id" @click="lightboxClient = c" :style="{borderRadius:'10px',overflow:'hidden',cursor:'pointer',position:'relative',background:'#0f172a',border:'1px solid rgba(51,65,85,0.5)',aspectRatio:'16/10',transition:'border-color 150ms'}" onmouseover="this.style.borderColor='rgba(99,102,241,0.4)'" onmouseout="this.style.borderColor='rgba(51,65,85,0.5)'">
          <img v-if="c.hasThumbnail" :src="thumbnailUrl(c)" @error="onImgError" loading="lazy" style="width:100%;height:100%;object-fit:cover" />
          <div v-else style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
            <i class="fa-solid fa-camera" style="font-size:20px;color:#334155"></i>
          </div>
          <div :style="{position:'absolute',top:'6px',left:'6px',display:'flex',alignItems:'center',gap:'4px',padding:'2px 6px',background:'rgba(2,8,22,0.85)',borderRadius:'6px',fontSize:'10px'}">
            <span class="status-dot" :class="c.online ? 'status-dot-online' : 'status-dot-offline'" style="width:5px;height:5px"></span>
            <span style="color:#e2e8f0;font-weight:500">{{ c.nickname || c.host }}</span>
          </div>
          <div :style="{position:'absolute',bottom:'0',left:'0',right:'0',padding:'6px 8px',background:'linear-gradient(transparent,rgba(2,8,22,0.9))',fontSize:'10px'}">
            <div style="color:#94a3b8">{{ c.user }} · {{ c.os }}</div>
            <div style="color:#64748b">{{ timeSince(c.lastSeen) }}</div>
          </div>
        </div>
      </div>

      <div v-if="totalPages > 1" class="pagination">
        <span style="font-size:12px;color:#64748b">Page {{ page }} / {{ totalPages }}</span>
        <div style="display:flex;gap:8px">
          <button @click="page = Math.max(1, page-1)" :disabled="page<=1" class="btn btn-sm"><i class="fa-solid fa-chevron-left"></i></button>
          <button @click="page = Math.min(totalPages, page+1)" :disabled="page>=totalPages" class="btn btn-sm"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </div>
    </template>

    <div v-if="lightboxClient" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8" @click.self="lightboxClient = null">
      <div style="position:relative;max-width:900px;width:100%">
        <button @click="lightboxClient = null" style="position:absolute;top:-36px;right:0;background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer"><i class="fa-solid fa-xmark"></i></button>
        <img v-if="lightboxClient.hasThumbnail" :src="thumbnailUrl(lightboxClient)" style="width:100%;border-radius:10px;border:1px solid rgba(51,65,85,0.6)" />
        <div v-else style="width:100%;aspect-ratio:16/10;background:#0f172a;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(51,65,85,0.6)">
          <span style="color:#64748b">No screenshot available</span>
        </div>
        <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:#e2e8f0">{{ lightboxClient.nickname || lightboxClient.host }}</span>
          <span style="color:#64748b">{{ lightboxClient.user }} · {{ lightboxClient.os }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
