<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface User {
  id: number
  username: string
  role: string
}

interface AccessRule {
  id: number
  userId: number
  clientId: string
  accessType: 'allowlist' | 'denylist'
}

interface Client {
  id: string
  host: string
  nickname?: string
}

const users = ref<User[]>([])
const clients = ref<Client[]>([])
const selectedUserId = ref<number | null>(null)
const accessScope = ref<'all' | 'allowlist' | 'denylist'>('all')
const rules = ref<AccessRule[]>([])
const newClientId = ref('')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')

async function loadData() {
  loading.value = true
  try {
    const [usersData, clientsData] = await Promise.all([
      api.get<{ users: User[] }>('/api/users'),
      api.get<{ items: Client[] }>('/api/clients?pageSize=9999')
    ])
    users.value = usersData.users || []
    clients.value = clientsData.items || []
  } catch {
    // silent
  } finally {
    loading.value = false
  }
}

async function loadUserAccess() {
  if (!selectedUserId.value) return
  error.value = ''
  try {
    const data = await api.get<{ scope: string; rules: AccessRule[] }>(`/api/users/${selectedUserId.value}/client-access`)
    accessScope.value = data.scope as any || 'all'
    rules.value = data.rules || []
  } catch {
    rules.value = []
    accessScope.value = 'all'
  }
}

watch(selectedUserId, (val) => {
  if (val) loadUserAccess()
})

function addRule() {
  if (!newClientId.value || !selectedUserId.value) return
  const exists = rules.value.some(r => r.clientId === newClientId.value)
  if (exists) return
  rules.value.push({
    id: Date.now(),
    userId: selectedUserId.value,
    clientId: newClientId.value,
    accessType: accessScope.value === 'denylist' ? 'denylist' : 'allowlist'
  })
  newClientId.value = ''
}

function removeRule(clientId: string) {
  rules.value = rules.value.filter(r => r.clientId !== clientId)
}

async function saveAccess() {
  if (!selectedUserId.value) return
  saving.value = true
  error.value = ''
  try {
    await api.put(`/api/users/${selectedUserId.value}/client-access`, {
      scope: accessScope.value,
      rules: rules.value.map(r => ({ clientId: r.clientId }))
    })
    success.value = 'Access rules saved'
  } catch (e: any) {
    error.value = e.message || 'Failed to save'
  } finally {
    saving.value = false
  }
}

function clientName(id: string) {
  const c = clients.value.find(x => x.id === id)
  return c?.host || id
}

onMounted(loadData)
</script>

<template>
  <div class="min-h-screen bg-slate-950 p-6">
    <div class="max-w-4xl mx-auto">
      <h1 class="text-xl font-semibold text-slate-100 mb-6">User Client Access</h1>

      <div v-if="error" class="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">{{ error }}</div>
      <div v-if="success" class="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-sm">{{ success }}</div>

      <div class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
        <label class="block text-xs text-slate-400 mb-1.5">Select User</label>
        <AppSelect
          v-model="selectedUserId"
          :options="users.map(user => ({ value: user.id, label: user.username + ' (' + user.role + ')' }))"
          placeholder="Select user..."
          searchable
        />
      </div>

      <template v-if="selectedUserId">
        <div class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
          <h2 class="text-sm font-medium text-slate-300 mb-3">Access Scope</h2>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="radio" v-model="accessScope" value="all" class="text-blue-500" />
              All Clients
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="radio" v-model="accessScope" value="allowlist" class="text-blue-500" />
              Allowlist
            </label>
            <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="radio" v-model="accessScope" value="denylist" class="text-blue-500" />
              Denylist
            </label>
          </div>
        </div>

        <div v-if="accessScope !== 'all'" class="bg-slate-900 border border-slate-800 rounded p-5 mb-6">
          <h2 class="text-sm font-medium text-slate-300 mb-3">
            {{ accessScope === 'allowlist' ? 'Allowed' : 'Denied' }} Clients
          </h2>
          <div class="flex gap-2 mb-3">
            <AppSelect
              v-model="newClientId"
              :options="clients.map(c => ({ value: c.id, label: c.nickname || c.host }))"
              placeholder="Select client..."
              searchable
              style="flex:1"
            />
            <button
              @click="addRule"
              :disabled="!newClientId"
              class="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded"
            >
              <i class="fas fa-plus"></i>
            </button>
          </div>

          <div v-if="rules.length === 0" class="text-center py-4 text-slate-500 text-sm">
            No rules configured
          </div>
          <div v-else class="space-y-1">
            <div
              v-for="rule in rules"
              :key="rule.id"
              class="flex items-center justify-between px-3 py-2 bg-slate-800/50 rounded text-sm"
            >
              <span class="text-slate-200">{{ clientName(rule.clientId) }}</span>
              <button
                @click="removeRule(rule.clientId)"
                class="text-slate-500 hover:text-red-400"
              >
                <i class="fas fa-times text-xs"></i>
              </button>
            </div>
          </div>
        </div>

        <button
          @click="saveAccess"
          :disabled="saving"
          class="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm rounded font-medium"
        >
          <i v-if="saving" class="fas fa-spinner fa-spin mr-2"></i>
          <i v-else class="fas fa-save mr-2"></i>
          Save Access Rules
        </button>
      </template>
    </div>
  </div>
</template>
