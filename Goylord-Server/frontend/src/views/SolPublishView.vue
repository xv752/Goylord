<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface RpcEndpoint {
  url: string; id?: string; addedBy?: string; addedAt?: string
}

const endpoints = ref<RpcEndpoint[]>([])
const newEndpointUrl = ref('')
const loading = ref(true)
const adding = ref(false)
const testing = ref(false)
const testResults = ref<any>(null)

const privateKey = ref('')
const serverUrl = ref('')
const rpcUrl = ref('')
const publishing = ref(false)
const publishResult = ref<any>(null)

const balanceKey = ref('')
const balanceRpc = ref('')
const balanceLoading = ref(false)
const balanceResult = ref<any>(null)

const error = ref('')
const success = ref('')

async function loadEndpoints() {
  loading.value = true
  try {
    const data = await api.get<{ endpoints: string[]; records: RpcEndpoint[] }>('/api/sol/rpc-endpoints')
    endpoints.value = data.records || []
    if (endpoints.value.length > 0 && !rpcUrl.value) rpcUrl.value = endpoints.value[0].url
  } catch {} finally { loading.value = false }
}

async function addEndpoint() {
  if (!newEndpointUrl.value) return
  adding.value = true; error.value = ''
  try {
    await api.post('/api/sol/rpc-endpoints', { url: newEndpointUrl.value })
    newEndpointUrl.value = ''
    await loadEndpoints()
    success.value = 'Endpoint added'
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { adding.value = false }
}

async function deleteEndpoint(id: string) {
  try {
    await api.delete(`/api/sol/rpc-endpoints/${id}`)
    await loadEndpoints()
  } catch (e: any) { error.value = e.message || 'Failed' }
}

async function testEndpoints() {
  testing.value = true; testResults.value = null; error.value = ''
  try {
    testResults.value = await api.post('/api/sol/rpc-endpoints/test')
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { testing.value = false }
}

async function publish() {
  if (!privateKey.value || !serverUrl.value || !rpcUrl.value) return
  publishing.value = true; publishResult.value = null; error.value = ''
  try {
    publishResult.value = await api.post('/api/sol/publish', {
      privateKeyBase58: privateKey.value,
      serverUrl: serverUrl.value,
      rpcUrl: rpcUrl.value
    })
    success.value = 'Published!'
  } catch (e: any) { error.value = e.message || 'Publish failed' }
  finally { publishing.value = false }
}

async function checkBalance() {
  if (!balanceKey.value || !balanceRpc.value) return
  balanceLoading.value = true; balanceResult.value = null; error.value = ''
  try {
    balanceResult.value = await api.post('/api/sol/balance', {
      publicKeyBase58: balanceKey.value,
      rpcUrl: balanceRpc.value
    })
  } catch (e: any) { error.value = e.message || 'Failed' }
  finally { balanceLoading.value = false }
}

onMounted(loadEndpoints)
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-link-slash" style="margin-right:8px;color:#a78bfa"></i>Solana Publish</h1>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Publish Memo</h2>
          <div style="display:flex;flex-direction:column;gap:10px">
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Server URL</label>
              <input v-model="serverUrl" placeholder="wss://your-server.com" class="input" style="width:100%" />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">RPC Endpoint</label>
              <AppSelect v-model="rpcUrl" :options="endpoints.map(ep => ({ value: ep.url, label: ep.url }))" placeholder="Select endpoint..." searchable />
            </div>
            <div>
              <label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Private Key (Base58)</label>
              <input v-model="privateKey" type="password" placeholder="Solana private key..." class="input" style="width:100%" />
            </div>
            <button @click="publish" :disabled="!privateKey || !serverUrl || !rpcUrl || publishing" class="btn btn-primary btn-sm" style="width:100%">
              <i v-if="publishing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-paper-plane"></i>
              {{ publishing ? 'Publishing...' : 'Publish Memo' }}
            </button>
          </div>

          <div v-if="publishResult?.success" style="margin-top:12px;padding:10px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;font-size:12px">
            <div style="color:#86efac;font-weight:500;margin-bottom:6px"><i class="fa-solid fa-check" style="margin-right:6px"></i>Published</div>
            <div style="color:#94a3b8;margin-bottom:2px">Signature: <code style="color:#e2e8f0">{{ publishResult.signature }}</code></div>
            <div style="color:#94a3b8;margin-bottom:2px">Address: <code style="color:#e2e8f0">{{ publishResult.address }}</code></div>
            <a v-if="publishResult.explorerUrl" :href="publishResult.explorerUrl" target="_blank" style="color:#818cf8;font-size:11px">View on Explorer</a>
          </div>
        </div>

        <div class="panel">
          <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:10px">Check Balance</h2>
          <div style="display:flex;flex-direction:column;gap:10px">
            <input v-model="balanceKey" placeholder="Public key (Base58)" class="input" style="width:100%" />
            <AppSelect v-model="balanceRpc" :options="endpoints.map(ep => ({ value: ep.url, label: ep.url }))" placeholder="Select RPC..." searchable />
            <button @click="checkBalance" :disabled="!balanceKey || !balanceRpc || balanceLoading" class="btn btn-sm" style="width:100%">
              <i v-if="balanceLoading" class="fa-solid fa-spinner fa-spin"></i>Check Balance
            </button>
            <div v-if="balanceResult?.balanceSol !== undefined" style="font-size:14px;color:#e2e8f0;font-weight:600">
              {{ balanceResult.balanceSol.toFixed(4) }} SOL
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="panel">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h2 style="font-size:13px;font-weight:600;color:#cbd5e1">RPC Endpoints</h2>
            <button @click="testEndpoints" :disabled="testing" class="btn btn-ghost" style="padding:4px 8px;font-size:11px">
              <i v-if="testing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-vial"></i> Test All
            </button>
          </div>
          <div style="display:flex;gap:8px;margin-bottom:12px">
            <input v-model="newEndpointUrl" placeholder="https://api.mainnet-beta.solana.com" class="input" style="flex:1" @keydown.enter="addEndpoint" />
            <button @click="addEndpoint" :disabled="!newEndpointUrl || adding" class="btn btn-primary btn-sm"><i v-if="adding" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-plus"></i></button>
          </div>
          <div v-if="loading" class="loading-state" style="padding:16px"><i class="fa-solid fa-spinner fa-spin"></i></div>
          <div v-else-if="endpoints.length===0" class="empty-state" style="padding:16px">No endpoints configured</div>
          <div v-else style="display:flex;flex-direction:column;gap:6px">
            <div v-for="ep in endpoints" :key="ep.url" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:8px">
              <i class="fa-solid fa-server" style="color:#64748b;font-size:11px"></i>
              <span style="flex:1;font-size:12px;color:#e2e8f0;font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ ep.url }}</span>
              <button v-if="ep.id" @click="deleteEndpoint(ep.id)" class="btn-icon-sm" style="width:24px;height:24px"><i class="fa-solid fa-trash" style="font-size:10px"></i></button>
            </div>
          </div>

          <div v-if="testResults" style="margin-top:12px;padding:10px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:8px">
            <div style="font-size:12px;color:#94a3b8;margin-bottom:6px">{{ testResults.passed }}/{{ testResults.tested }} passed, {{ testResults.failed }} failed</div>
            <div v-for="r in testResults.results" :key="r.url" style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:11px">
              <i :class="r.ok ? 'fa-solid fa-check-circle' : 'fa-solid fa-xmark-circle'" :style="{color: r.ok ? '#86efac' : '#fca5a5'}"></i>
              <span style="color:#e2e8f0;font-family:ui-monospace,monospace;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ r.url }}</span>
              <span style="color:#64748b">{{ r.latencyMs ? r.latencyMs + 'ms' : r.error || '' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
