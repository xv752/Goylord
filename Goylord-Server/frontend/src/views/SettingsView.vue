<template>
  <div>
    <header class="settings-header">
      <button class="btn-icon-sm" @click="$router.back()"><i class="fa-solid fa-arrow-left"></i></button>
      <h1 class="section-title">Settings</h1>
    </header>

    <div class="settings-body">
      <div class="settings-tabs">
        <button
          v-for="tab in tabs" :key="tab.id"
          class="settings-tab"
          :class="{ 'settings-tab-active': activeTab === tab.id }"
          @click="activeTab = tab.id"
        >{{ tab.label }}</button>
      </div>

      <div v-if="toast" :class="['alert', toastType === 'success' ? 'alert-success' : 'alert-error']" style="margin-bottom:16px">
        {{ toast }}
      </div>

      <div v-if="activeTab === 'general'" class="settings-section">
        <h2 class="settings-section-title">General</h2>
        <div class="settings-field">
          <label class="settings-label">Server Name</label>
          <input v-model="settings.serverName" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Port</label>
          <input v-model.number="settings.port" type="number" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Agent Token</label>
          <input v-model="settings.agentToken" type="password" class="input settings-input" />
        </div>
        <div class="settings-toggle-row">
          <button type="button" class="toggle" :class="{ active: settings.requireApproval }" @click="settings.requireApproval = !settings.requireApproval"></button>
          <label style="font-size:0.875rem;color:#cbd5e1">Require enrollment approval</label>
        </div>
        <button :disabled="saving" class="btn btn-primary btn-sm" @click="saveTab('general')">
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save
        </button>
      </div>

      <div v-if="activeTab === 'security'" class="settings-section">
        <h2 class="settings-section-title">Security</h2>
        <div class="settings-field">
          <label class="settings-label">Max Login Attempts</label>
          <input v-model.number="security.maxLoginAttempts" type="number" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Lockout Duration (seconds)</label>
          <input v-model.number="security.lockoutDuration" type="number" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Session Timeout (seconds)</label>
          <input v-model.number="security.sessionTimeout" type="number" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">CORS Origins</label>
          <input v-model="security.corsOrigins" placeholder="https://example.com, https://other.com" class="input settings-input" />
        </div>
        <button :disabled="saving" class="btn btn-primary btn-sm" @click="saveTab('security')">
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save
        </button>
      </div>

      <div v-if="activeTab === 'tls'" class="settings-section">
        <h2 class="settings-section-title">TLS</h2>
        <div class="settings-field">
          <label class="settings-label">Certificate Path</label>
          <input v-model="tls.certPath" placeholder="/path/to/cert.pem" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Key Path</label>
          <input v-model="tls.keyPath" placeholder="/path/to/key.pem" class="input settings-input" />
        </div>
        <button :disabled="saving" class="btn btn-primary btn-sm" @click="saveTab('tls')">
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save
        </button>
      </div>

      <div v-if="activeTab === 'appearance'" class="settings-section">
        <h2 class="settings-section-title">Appearance</h2>
        <div class="settings-field">
          <label class="settings-label">Branding Name</label>
          <input v-model="appearance.brandName" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Logo URL</label>
          <input v-model="appearance.logoUrl" placeholder="https://example.com/logo.png" class="input settings-input" />
        </div>
        <div class="settings-field">
          <label class="settings-label">Custom CSS</label>
          <textarea v-model="appearance.customCss" rows="6" class="input settings-input" style="font-family:ui-monospace,monospace;font-size:12px;resize:vertical"></textarea>
        </div>
        <button :disabled="saving" class="btn btn-primary btn-sm" @click="saveTab('appearance')">
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save
        </button>
      </div>

      <div v-if="activeTab === 'chat'" class="settings-section">
        <h2 class="settings-section-title">Chat</h2>
        <div class="settings-toggle-row">
          <button type="button" class="toggle" :class="{ active: chat.enabled }" @click="chat.enabled = !chat.enabled"></button>
          <label style="font-size:0.875rem;color:#cbd5e1">Enable chat</label>
        </div>
        <div class="settings-field">
          <label class="settings-label">Allowed Roles (comma-separated)</label>
          <input v-model="chat.allowedRoles" placeholder="admin, operator" class="input settings-input" />
        </div>
        <button :disabled="saving" class="btn btn-primary btn-sm" @click="saveTab('chat')">
          <i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'security', label: 'Security' },
  { id: 'tls', label: 'TLS' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'chat', label: 'Chat' },
]

const activeTab = ref('general')
const saving = ref(false)
const toast = ref('')
const toastType = ref('success')

const settings = reactive({ serverName: '', port: 5173, agentToken: '', requireApproval: true })
const security = reactive({ maxLoginAttempts: 5, lockoutDuration: 300, sessionTimeout: 86400, corsOrigins: '' })
const tls = reactive({ certPath: '', keyPath: '' })
const appearance = reactive({ brandName: '', logoUrl: '', customCss: '' })
const chat = reactive({ enabled: true, allowedRoles: '' })

function showToast(msg, type = 'success') {
  toast.value = msg; toastType.value = type
  setTimeout(() => { toast.value = '' }, 3000)
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings', { credentials: 'include' })
    const data = await res.json()
    if (data.serverName !== undefined) settings.serverName = data.serverName
    if (data.port !== undefined) settings.port = data.port
    if (data.agentToken !== undefined) settings.agentToken = data.agentToken
    if (data.requireApproval !== undefined) settings.requireApproval = data.requireApproval
    if (data.maxLoginAttempts !== undefined) security.maxLoginAttempts = data.maxLoginAttempts
    if (data.lockoutDuration !== undefined) security.lockoutDuration = data.lockoutDuration
    if (data.sessionTimeout !== undefined) security.sessionTimeout = data.sessionTimeout
    if (data.corsOrigins !== undefined) security.corsOrigins = data.corsOrigins
    if (data.tlsCertPath !== undefined) tls.certPath = data.tlsCertPath
    if (data.tlsKeyPath !== undefined) tls.keyPath = data.tlsKeyPath
    if (data.brandName !== undefined) appearance.brandName = data.brandName
    if (data.logoUrl !== undefined) appearance.logoUrl = data.logoUrl
    if (data.customCss !== undefined) appearance.customCss = data.customCss
    if (data.chatEnabled !== undefined) chat.enabled = data.chatEnabled
    if (data.chatAllowedRoles !== undefined) chat.allowedRoles = data.chatAllowedRoles
  } catch { showToast('Failed to load settings', 'error') }
}

async function saveTab(tab) {
  saving.value = true
  try {
    let res
    if (tab === 'general') res = await fetch('/api/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(settings) })
    else if (tab === 'security') res = await fetch('/api/security', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(security) })
    else if (tab === 'tls') res = await fetch('/api/tls', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(tls) })
    else if (tab === 'appearance') res = await fetch('/api/appearance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(appearance) })
    else if (tab === 'chat') res = await fetch('/api/chat-config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(chat) })
    if (res && res.ok) showToast('Settings saved')
    else { const err = res ? await res.json().catch(() => ({})) : {}; showToast(err.error || 'Save failed', 'error') }
  } catch { showToast('Network error', 'error') } finally { saving.value = false }
}

onMounted(loadSettings)
</script>

<style scoped>
.settings-header {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 20px;
  background: rgba(8, 12, 24, 0.72);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  margin: -20px -20px 20px;
}
.settings-body {
  max-width: 640px;
}
.settings-tabs {
  display: flex; gap: 2px;
  border-bottom: 1px solid var(--cv-border);
  margin-bottom: 20px;
}
.settings-tab {
  padding: 10px 16px;
  font-size: 0.875rem; font-weight: 500;
  color: #64748b;
  background: transparent; border: none;
  border-bottom: 2px solid transparent;
  transition: all 140ms ease;
}
.settings-tab:hover { color: #94a3b8; }
.settings-tab-active {
  color: #e8edf2;
  border-bottom-color: #6366f1;
}

.settings-section {
  background: rgba(30, 41, 59, 0.72);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 14px;
  padding: 20px;
  display: flex; flex-direction: column; gap: 16px;
}
.settings-section-title {
  font-size: 0.875rem; font-weight: 500; color: #cbd5e1;
  margin: 0;
}
.settings-field {
  display: flex; flex-direction: column; gap: 6px;
}
.settings-label {
  font-size: 12px; font-weight: 500; color: #94a3b8;
}
.settings-input {
  width: 100%;
}
.settings-toggle-row {
  display: flex; align-items: center; gap: 12px;
}
</style>
