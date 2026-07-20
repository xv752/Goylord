<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../lib/api'

interface NotificationConfig {
  keywords?: string[]; clipboardEnabled?: boolean
  webhookEnabled?: boolean; webhookUrl?: string; webhookTemplate?: string
  telegramEnabled?: boolean; telegramBotToken?: string; telegramChatId?: string; telegramTemplate?: string
  antiSpamMaxHits?: number; antiSpamWindowMs?: number; antiSpamCooldownMs?: number
}
interface UserSettings {
  webhook_enabled?: boolean; webhook_url?: string; webhook_template?: string
  telegram_enabled?: boolean; telegram_bot_token?: string; telegram_chat_id?: string; telegram_template?: string
  client_event_webhook?: boolean; client_event_telegram?: boolean; client_event_push?: boolean
}

const config = ref<NotificationConfig>({})
const userSettings = ref<UserSettings>({})
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const activeTab = ref<'keywords' | 'webhook' | 'telegram' | 'events'>('keywords')
const newKeyword = ref('')
const error = ref('')
const success = ref('')
const testResult = ref<any>(null)
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setInterval> | null = null
const liveConnected = ref(false)
const previewModal = ref<string | null>(null)

async function loadAll() {
  loading.value = true
  try {
    const [conf, sets] = await Promise.all([
      api.get<{ notifications: NotificationConfig }>('/api/notifications/config').catch(() => ({ notifications: {} })),
      api.get<{ settings: UserSettings; defaults: any }>('/api/notifications/my-settings').catch(() => ({ settings: {}, defaults: {} })),
    ])
    config.value = conf.notifications || {}
    userSettings.value = sets.settings || {}
    if (sets.defaults) {
      if (!userSettings.value.webhook_template && sets.defaults.webhookTemplate) userSettings.value.webhook_template = sets.defaults.webhookTemplate
      if (!userSettings.value.telegram_template && sets.defaults.telegramTemplate) userSettings.value.telegram_template = sets.defaults.telegramTemplate
    }
  } catch {} finally { loading.value = false }
}

async function saveKeywords() {
  saving.value = true; error.value = ''
  try {
    await api.put('/api/notifications/config', { keywords: config.value.keywords, clipboardEnabled: config.value.clipboardEnabled })
    success.value = 'Keywords saved'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function saveAntiSpam() {
  saving.value = true; error.value = ''
  try {
    await api.put('/api/notifications/config', {
      antiSpamMaxHits: config.value.antiSpamMaxHits,
      antiSpamWindowMs: config.value.antiSpamWindowMs,
      antiSpamCooldownMs: config.value.antiSpamCooldownMs,
    })
    success.value = 'Anti-spam saved'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function saveWebhook() {
  saving.value = true; error.value = ''
  try {
    await api.put('/api/notifications/my-settings', {
      webhook_enabled: userSettings.value.webhook_enabled,
      webhook_url: userSettings.value.webhook_url,
      webhook_template: userSettings.value.webhook_template,
    })
    success.value = 'Webhook saved'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function saveTelegram() {
  saving.value = true; error.value = ''
  try {
    await api.put('/api/notifications/my-settings', {
      telegram_enabled: userSettings.value.telegram_enabled,
      telegram_bot_token: userSettings.value.telegram_bot_token,
      telegram_chat_id: userSettings.value.telegram_chat_id,
      telegram_template: userSettings.value.telegram_template,
    })
    success.value = 'Telegram saved'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function saveEvents() {
  saving.value = true; error.value = ''
  try {
    await api.put('/api/notifications/my-settings', {
      client_event_webhook: userSettings.value.client_event_webhook,
      client_event_telegram: userSettings.value.client_event_telegram,
      client_event_push: userSettings.value.client_event_push,
    })
    success.value = 'Event settings saved'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function testWebhook() {
  if (!userSettings.value.webhook_url) return
  testing.value = true; testResult.value = null; error.value = ''
  try {
    testResult.value = await api.post('/api/notifications/my-settings/preview/webhook', {
      webhookUrl: userSettings.value.webhook_url,
      webhookTemplate: userSettings.value.webhook_template,
    })
    success.value = `Webhook sent (HTTP ${testResult.value.status})`
  } catch (e: any) { error.value = e.message || 'Test failed' }
  finally { testing.value = false }
}

function addKeyword() {
  if (!newKeyword.value.trim()) return
  if (!config.value.keywords) config.value.keywords = []
  config.value.keywords.push(newKeyword.value.trim())
  newKeyword.value = ''
}
function removeKeyword(idx: number) {
  config.value.keywords?.splice(idx, 1)
}

function connectWs() {
  try {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${protocol}//${location.host}/api/notifications/ws`)
    ws.onopen = () => { liveConnected.value = true }
    ws.onclose = () => { liveConnected.value = false; scheduleReconnect() }
    ws.onerror = () => { ws?.close() }
  } catch { scheduleReconnect() }
}
function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setInterval(() => { if (!ws || ws.readyState === WebSocket.CLOSED) { clearInterval(reconnectTimer!); reconnectTimer = null; connectWs() } }, 5000)
}

onMounted(() => { loadAll(); connectWs() })
onUnmounted(() => { ws?.close(); if (reconnectTimer) clearInterval(reconnectTimer) })
</script>

<template>
  <div>
    <div class="section-header">
      <div style="display:flex;align-items:center;gap:12px">
        <h1 class="section-title"><i class="fa-solid fa-bell" style="margin-right:8px;color:#facc15"></i>Notifications</h1>
        <span class="badge badge-sm" :class="liveConnected ? 'badge-success' : ''" :style="!liveConnected ? {background:'rgba(71,85,105,0.3)',color:'#94a3b8',borderColor:'rgba(71,85,105,0.55)'} : {}">
          <span class="status-dot" :class="liveConnected ? 'status-dot-online' : 'status-dot-offline'" style="width:6px;height:6px"></span>{{ liveConnected ? 'Live' : 'Offline' }}
        </span>
      </div>
      <button @click="loadAll" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    <template v-else>
      <div style="display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--cv-border)">
        <button v-for="tab in (['keywords','webhook','telegram','events'] as const)" :key="tab" class="settings-tab" :class="{'settings-tab-active': activeTab===tab}" @click="activeTab=tab" style="text-transform:capitalize">
          <i :class="tab==='keywords'?'fa-solid fa-key':tab==='webhook'?'fa-solid fa-link':tab==='telegram'?'fa-solid fa-paper-plane':'fa-solid fa-bolt'" style="margin-right:6px"></i>{{ tab }}
        </button>
      </div>

      <div v-if="activeTab === 'keywords'" class="panel">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:12px">Keyword Matching</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <button type="button" class="toggle" :class="{active: config.clipboardEnabled}" @click="config.clipboardEnabled = !config.clipboardEnabled"></button>
          <span style="font-size:13px;color:#cbd5e1">Monitor Clipboard</span>
        </div>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input v-model="newKeyword" @keydown.enter="addKeyword" placeholder="Add keyword..." class="input" style="flex:1" />
          <button @click="addKeyword" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i></button>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
          <span v-for="(kw, i) in config.keywords || []" :key="i" class="badge badge-sm badge-primary">
            {{ kw }} <button @click="removeKeyword(i)" style="background:none;border:none;color:inherit;cursor:pointer;font-size:10px;padding:0 2px"><i class="fa-solid fa-xmark"></i></button>
          </span>
          <span v-if="!config.keywords?.length" style="font-size:12px;color:#64748b">No keywords configured</span>
        </div>
        <div style="display:flex;gap:12px;margin-bottom:16px;padding-top:12px;border-top:1px solid var(--cv-border)">
          <div style="flex:1"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Max Hits</label><input v-model.number="config.antiSpamMaxHits" type="number" class="input" style="width:100%" /></div>
          <div style="flex:1"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Window (ms)</label><input v-model.number="config.antiSpamWindowMs" type="number" class="input" style="width:100%" /></div>
          <div style="flex:1"><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Cooldown (ms)</label><input v-model.number="config.antiSpamCooldownMs" type="number" class="input" style="width:100%" /></div>
        </div>
        <div style="display:flex;gap:8px">
          <button @click="saveKeywords" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save Keywords</button>
          <button @click="saveAntiSpam" :disabled="saving" class="btn btn-sm">Save Anti-Spam</button>
        </div>
      </div>

      <div v-if="activeTab === 'webhook'" class="panel">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:12px">Webhook Notifications</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <button type="button" class="toggle" :class="{active: userSettings.webhook_enabled}" @click="userSettings.webhook_enabled = !userSettings.webhook_enabled"></button>
          <span style="font-size:13px;color:#cbd5e1">Enable Webhook</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Webhook URL</label>
            <input v-model="userSettings.webhook_url" placeholder="https://hooks.example.com/..." class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Template (JSON)</label>
            <textarea v-model="userSettings.webhook_template" rows="6" class="input" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;resize:vertical" spellcheck="false"></textarea></div>
        </div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button @click="saveWebhook" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
          <button @click="testWebhook" :disabled="testing || !userSettings.webhook_url" class="btn btn-sm">
            <i v-if="testing" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-vial"></i> Test
          </button>
        </div>
        <div v-if="testResult" style="margin-top:10px;padding:8px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:8px;font-size:11px;color:#94a3b8">
          Status: {{ testResult.status }} {{ testResult.statusText }} · Mode: {{ testResult.mode }}
        </div>
      </div>

      <div v-if="activeTab === 'telegram'" class="panel">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:12px">Telegram Notifications</h2>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <button type="button" class="toggle" :class="{active: userSettings.telegram_enabled}" @click="userSettings.telegram_enabled = !userSettings.telegram_enabled"></button>
          <span style="font-size:13px;color:#cbd5e1">Enable Telegram</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Bot Token</label>
            <input v-model="userSettings.telegram_bot_token" type="password" placeholder="123456:ABC-DEF..." class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Chat ID</label>
            <input v-model="userSettings.telegram_chat_id" placeholder="-100123456789" class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;display:block;margin-bottom:4px">Template</label>
            <textarea v-model="userSettings.telegram_template" rows="4" class="input" style="width:100%;font-family:ui-monospace,monospace;font-size:12px;resize:vertical" spellcheck="false"></textarea></div>
        </div>
        <button @click="saveTelegram" :disabled="saving" class="btn btn-primary btn-sm" style="margin-top:12px"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
      </div>

      <div v-if="activeTab === 'events'" class="panel">
        <h2 style="font-size:13px;font-weight:600;color:#cbd5e1;margin-bottom:12px">Event Notifications</h2>
        <p style="font-size:12px;color:#64748b;margin-bottom:14px">Configure which channels receive client online/offline/purgatory event notifications.</p>
        <div style="display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <button type="button" class="toggle" :class="{active: userSettings.client_event_webhook}" @click="userSettings.client_event_webhook = !userSettings.client_event_webhook"></button>
            <span style="font-size:13px;color:#cbd5e1">Send to Webhook</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button type="button" class="toggle" :class="{active: userSettings.client_event_telegram}" @click="userSettings.client_event_telegram = !userSettings.client_event_telegram"></button>
            <span style="font-size:13px;color:#cbd5e1">Send to Telegram</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <button type="button" class="toggle" :class="{active: userSettings.client_event_push}" @click="userSettings.client_event_push = !userSettings.client_event_push"></button>
            <span style="font-size:13px;color:#cbd5e1">Send Push Notification</span>
          </div>
        </div>
        <button @click="saveEvents" :disabled="saving" class="btn btn-primary btn-sm" style="margin-top:14px"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-tab {
  padding: 10px 16px; font-size: 0.875rem; font-weight: 500; color: #64748b;
  background: transparent; border: none; border-bottom: 2px solid transparent;
  transition: all 140ms ease; cursor: pointer;
}
.settings-tab:hover { color: #94a3b8; }
.settings-tab-active { color: #e8edf2; border-bottom-color: #6366f1; }
</style>
