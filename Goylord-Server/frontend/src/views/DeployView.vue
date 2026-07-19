<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

interface Client {
  id: string
  host: string
  nickname?: string
  online: boolean
}

const clients = ref<Client[]>([])
const loading = ref(true)
const selectedClient = ref('')
const uploadProgress = ref(0)
const uploading = ref(false)
const deploying = ref(false)
const error = ref('')
const success = ref('')
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)

async function loadClients() {
  loading.value = true
  try {
    const data = await api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    clients.value = (data.items || []).filter((c: any) => c.online)
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    selectedFile.value = files[0]
  }
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    selectedFile.value = input.files[0]
  }
}

function clearFile() {
  selectedFile.value = null
  uploadProgress.value = 0
  if (fileInput.value) fileInput.value.value = ''
}

async function uploadAndDeploy() {
  if (!selectedFile.value || !selectedClient.value) return
  uploading.value = true
  deploy.value = false
  error.value = ''
  success.value = ''
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    const xhr = new XMLHttpRequest()
    const uploadPromise = new Promise<void>((resolve, reject) => {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          uploadProgress.value = Math.round((e.loaded / e.total) * 100)
        }
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve()
        else reject(new Error(xhr.statusText || 'Upload failed'))
      }
      xhr.onerror = () => reject(new Error('Upload failed'))
    })

    xhr.open('POST', '/api/deploy/upload')
    xhr.send(formData)
    await uploadPromise

    uploading.value = false
    success.value = 'File uploaded. Deploying...'

    await api.post(`/api/deploy/${selectedClient.value}/run`)
    success.value = 'Deploy completed'
    clearFile()
    selectedClient.value = ''
  } catch (e: any) {
    error.value = e.message || 'Deploy failed'
  } finally {
    uploading.value = false
  }
}

onMounted(loadClients)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-xl font-semibold text-slate-100 mb-6">Deploy</h1>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
        <h2 class="text-sm font-medium text-slate-300 mb-3">Upload Package</h2>
        <div
          @dragover="onDragOver"
          @dragleave="onDragLeave"
          @drop="onDrop"
          @click="fileInput?.click()"
          :class="[
            'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
            dragOver ? 'border-blue-500 bg-blue-500/5' : 'border-slate-700 hover:border-slate-600'
          ]"
        >
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            @change="onFileSelect"
          />
          <template v-if="selectedFile">
            <i class="fas fa-file-archive text-2xl text-slate-400 mb-2"></i>
            <div class="text-sm text-slate-200">{{ selectedFile.name }}</div>
            <div class="text-xs text-slate-500 mt-1">{{ (selectedFile.size / 1024).toFixed(1) }} KB</div>
            <button
              @click.stop="clearFile"
              class="mt-2 text-xs text-slate-400 hover:text-slate-200"
            >
              <i class="fas fa-times mr-1"></i>Remove
            </button>
          </template>
          <template v-else>
            <i class="fas fa-cloud-upload-alt text-2xl text-slate-500 mb-2"></i>
            <div class="text-sm text-slate-400">Drop file here or click to browse</div>
            <div class="text-xs text-slate-600 mt-1">Any file type</div>
          </template>
        </div>

        <div v-if="uploadProgress > 0 && uploading" class="mt-3">
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Uploading...</span>
            <span>{{ uploadProgress }}%</span>
          </div>
          <div class="h-1.5 bg-slate-800 rounded overflow-hidden">
            <div
              class="h-full bg-blue-500 rounded transition-all"
              :style="{ width: uploadProgress + '%' }"
            ></div>
          </div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
        <h2 class="text-sm font-medium text-slate-300 mb-3">Target Client</h2>
        <select
          v-model="selectedClient"
          class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="" disabled>Select a client...</option>
          <option v-for="client in clients" :key="client.id" :value="client.id">
            {{ client.nickname || client.host }}
          </option>
        </select>
        <div v-if="loading" class="text-xs text-slate-500 mt-2">
          <i class="fas fa-spinner fa-spin mr-1"></i>Loading clients...
        </div>
        <div v-else-if="clients.length === 0" class="text-xs text-slate-500 mt-2">
          No online clients available
        </div>
      </div>

      <button
        @click="uploadAndDeploy"
        :disabled="!selectedFile || !selectedClient || uploading"
        class="w-full px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
      >
        <i v-if="uploading" class="fas fa-spinner fa-spin mr-2"></i>
        <i v-else class="fas fa-rocket mr-2"></i>
        {{ uploading ? 'Deploying...' : 'Deploy' }}
      </button>
    </div>
  </div>
</template>
