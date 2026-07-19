<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../lib/api'

const router = useRouter()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const error = ref('')
const success = ref('')

async function submit() {
  error.value = ''
  success.value = ''

  if (!currentPassword.value || !newPassword.value) {
    error.value = 'All fields are required'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'New passwords do not match'
    return
  }
  if (newPassword.value.length < 4) {
    error.value = 'Password must be at least 4 characters'
    return
  }

  loading.value = true
  try {
    await api.post('/api/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    })
    success.value = 'Password changed. Redirecting to login...'
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
    setTimeout(() => {
      router.push('/login')
    }, 2000)
  } catch (e: any) {
    error.value = e.message || 'Failed to change password'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex items-center justify-center p-6">
    <div class="w-full max-w-sm">
      <h1 class="text-xl font-semibold text-slate-100 mb-6 text-center">Change Password</h1>

      <div class="bg-slate-900 border border-slate-800 rounded p-5">
        <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
        <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs text-slate-400 mb-1.5">Current Password</label>
            <input
              v-model="currentPassword"
              type="password"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              @keydown.enter="submit"
            />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1.5">New Password</label>
            <input
              v-model="newPassword"
              type="password"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              @keydown.enter="submit"
            />
          </div>
          <div>
            <label class="block text-xs text-slate-400 mb-1.5">Confirm New Password</label>
            <input
              v-model="confirmPassword"
              type="password"
              class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              @keydown.enter="submit"
            />
          </div>
        </div>

        <button
          @click="submit"
          :disabled="loading || !currentPassword || !newPassword || !confirmPassword"
          class="w-full mt-5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium"
        >
          <i v-if="loading" class="fas fa-spinner fa-spin mr-2"></i>
          {{ loading ? 'Changing...' : 'Change Password' }}
        </button>
      </div>
    </div>
  </div>
</template>
