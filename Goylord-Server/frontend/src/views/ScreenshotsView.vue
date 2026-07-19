<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'

interface Screenshot {
  id: number
  clientId: string
  hostname: string
  path: string
  createdAt: string
}

const screenshots = ref<Screenshot[]>([])
const loading = ref(true)
const lightbox = ref<Screenshot | null>(null)
const page = ref(1)
const limit = 12

async function loadScreenshots() {
  loading.value = true
  try {
    const data = await api.get<Screenshot[]>('/api/screenshots')
    screenshots.value = data
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

const totalPages = computed(() => Math.ceil(screenshots.value.length / limit))

const pagedScreenshots = computed(() => {
  const start = (page.value - 1) * limit
  return screenshots.value.slice(start, start + limit)
})

function openLightbox(screenshot: Screenshot) {
  lightbox.value = screenshot
}

function closeLightbox() {
  lightbox.value = null
}

function prevPage() {
  if (page.value > 1) page.value--
}

function nextPage() {
  if (page.value < totalPages.value) page.value++
}

function screenshotUrl(path: string) {
  if (path.startsWith('http')) return path
  return `/api/screenshots/file/${encodeURIComponent(path)}`
}

onMounted(loadScreenshots)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-xl font-semibold text-slate-100">Screenshots</h1>
        <button @click="loadScreenshots" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded border border-slate-700">
          <i class="fas fa-sync-alt mr-1.5"></i>Refresh
        </button>
      </div>

      <div v-if="loading" class="text-center py-12 text-slate-500 text-sm">
        <i class="fas fa-spinner fa-spin mr-2"></i>Loading...
      </div>
      <div v-else-if="screenshots.length === 0" class="text-center py-12 text-slate-500 text-sm">
        No screenshots captured yet
      </div>

      <template v-else>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
          <div
            v-for="s in pagedScreenshots"
            :key="s.id"
            @click="openLightbox(s)"
            class="bg-slate-900 border border-slate-800 rounded overflow-hidden cursor-pointer hover:border-slate-700 transition-colors"
          >
            <div class="aspect-video bg-slate-800 flex items-center justify-center">
              <img
                :src="screenshotUrl(s.path)"
                :alt="s.hostname"
                class="w-full h-full object-cover"
                loading="lazy"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              />
            </div>
            <div class="p-2.5">
              <div class="text-sm text-slate-200 truncate">{{ s.hostname }}</div>
              <div class="text-xs text-slate-500 mt-0.5">{{ new Date(s.createdAt).toLocaleString() }}</div>
            </div>
          </div>
        </div>

        <div v-if="totalPages > 1" class="flex items-center justify-center gap-3">
          <button
            @click="prevPage"
            :disabled="page <= 1"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-sm rounded border border-slate-700"
          >
            <i class="fas fa-chevron-left"></i>
          </button>
          <span class="text-sm text-slate-400">{{ page }} / {{ totalPages }}</span>
          <button
            @click="nextPage"
            :disabled="page >= totalPages"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 text-sm rounded border border-slate-700"
          >
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </template>

      <div
        v-if="lightbox"
        class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
        @click.self="closeLightbox"
      >
        <div class="relative max-w-5xl w-full">
          <button
            @click="closeLightbox"
            class="absolute -top-10 right-0 text-slate-400 hover:text-slate-200 text-lg"
          >
            <i class="fas fa-times"></i>
          </button>
          <img
            :src="screenshotUrl(lightbox.path)"
            :alt="lightbox.hostname"
            class="w-full rounded border border-slate-800"
          />
          <div class="mt-3 flex items-center justify-between text-sm">
            <span class="text-slate-300">{{ lightbox.hostname }}</span>
            <span class="text-slate-500">{{ new Date(lightbox.createdAt).toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
