<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')
const activeSection = ref('profile')
const showMfaSetup = ref(false)
const mfaCode = ref('')
const mfaUri = ref('')
const mfaSecret = ref('')
const mfaQrSvg = ref('')
const mfaDisablePassword = ref('')
const mfaDisableCode = ref('')
const showMfaDisable = ref(false)
const showTlsInfo = ref(false)
const showOidcModal = ref(false)
const showExportModal = ref(false)
const exportData = ref('')
const healthData = ref<any>(null)
const profilerData = ref<any>(null)
const profilerRunning = ref(false)
const profilerDuration = ref(3)
const userId = ref(0)

const profile = reactive({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' })
const mfa = reactive({ enabled: false, verified: false, backupCodes: [] as string[] })
const security = reactive({ minPasswordLength: 12, requireUppercase: true, requireLowercase: true, requireNumber: true, requireSpecial: true, sessionTtlHours: 168, maxLoginAttempts: 5, loginWindowMinutes: 15, lockoutDurationMinutes: 30, requireMfaAdmin: false, requireMfaNonAdmin: false })
const oidc = reactive({ enabled: false, issuer: '', clientId: '', clientSecret: '', scopes: 'openid profile email', loginLabel: '', autoRegister: false, allowCreation: true, redirectUri: '', defaultRole: 'viewer', authMethod: 'client_secret_post', allowedEmailDomains: '', allowedEmails: '', groupClaim: 'groups', adminGroups: '', operatorGroups: '', viewerGroups: '' })
const appearance = reactive({ theme: 'dark', brandName: 'Goylord', primaryColor: '#6366f1', accentColor: '#38bdf8', cssOverride: '', faviconUrl: '', navName: '', navIconClass: '', navLogoUrl: '', signInTitle: 'Welcome back', signInSubtitle: 'Sign in to your control panel', signInLogoUrl: '', footerText: 'Authorized access only', supportText: '', supportUrl: '', dashBgUrl: '', tabName: '', iconClass: '', logoUrl: '', logoAlt: '', heroImageUrl: '', heroImageAlt: '' })
const tls = reactive({ certbotEnabled: false, certbotEmail: '', certbotBasePath: '/etc/letsencrypt/live', certbotDomain: '', certFile: 'fullchain.pem', keyFile: 'privkey.pem', caFile: 'chain.pem' })
const chat = reactive({ enabled: false, autoScroll: true, showTimestamps: true, maxHistory: 100 })
const registration = reactive({ requireApproval: false, requireRegistrationKey: false, registrationKey: '', allowSelfRegister: true, defaultRole: 'operator', maxUsersTotal: 0, defaultGroupIds: '' })
const buildLimits = reactive({ maxConcurrent: 2, cooldownMs: 300000, maxBuildsPerHour: 5, maxConcurrentPerUser: 1, globalMaxConcurrent: 3 })
const inputArchive = reactive({ enabled: false, retentionDays: 7, maxFileBytes: 5242880, pollIntervalSeconds: 300 })
const thumbnails = reactive({ dashboardEnabled: true, wallEnabled: true })

const sections = [
  { id: 'profile', icon: 'fa-solid fa-user', label: 'Profile' },
  { id: 'password', icon: 'fa-solid fa-key', label: 'Password' },
  { id: 'mfa', icon: 'fa-solid fa-shield-halved', label: 'MFA' },
  { id: 'security', icon: 'fa-solid fa-lock', label: 'Security Policy' },
  { id: 'tls', icon: 'fa-solid fa-certificate', label: 'TLS / Certbot' },
  { id: 'oidc', icon: 'fa-solid fa-openid', label: 'OIDC' },
  { id: 'appearance', icon: 'fa-solid fa-palette', label: 'Appearance' },
  { id: 'chat', icon: 'fa-solid fa-comments', label: 'Chat' },
  { id: 'thumbnails', icon: 'fa-solid fa-image', label: 'Thumbnails' },
  { id: 'inputArchive', icon: 'fa-solid fa-keyboard', label: 'Input Archive' },
  { id: 'registration', icon: 'fa-solid fa-user-plus', label: 'Registration' },
  { id: 'builds', icon: 'fa-solid fa-hammer', label: 'Build Limits' },
  { id: 'backup', icon: 'fa-solid fa-download', label: 'Export / Import' },
  { id: 'health', icon: 'fa-solid fa-heart-pulse', label: 'Server Health' },
  { id: 'profiler', icon: 'fa-solid fa-gauge-high', label: 'Profiler' },
]

async function loadAll() {
  loading.value = true
  try {
    const [me, conf, sec, oidcConf, ch, reg, tls, ia, thumb, brl] = await Promise.all([
      api.get<any>('/api/auth/me').catch(() => ({})),
      api.get<any>('/api/settings/appearance').catch(() => ({})),
      api.get<any>('/api/settings/security').catch(() => ({})),
      api.get<any>('/api/settings/oidc').catch(() => ({})),
      api.get<any>('/api/settings/chat').catch(() => ({})),
      api.get<any>('/api/enrollment/settings').catch(() => ({})),
      api.get<any>('/api/settings/tls').catch(() => ({})),
      api.get<any>('/api/settings/input-archive').catch(() => ({})),
      api.get<any>('/api/settings/thumbnails').catch(() => ({})),
      api.get<any>('/api/settings/build-rate-limit').catch(() => ({})),
    ])
    profile.username = me.username || ''
    userId.value = me.userId || 1
    mfa.enabled = me.mfaEnabled || false
    mfa.verified = me.mfaVerified || false
    mfa.backupCodes = me.mfaBackupCodes || []
    appearance.cssOverride = conf.customCSS || ''
    if (conf.loginBranding) {
      appearance.brandName = conf.loginBranding.productName || 'Goylord'
      appearance.primaryColor = conf.loginBranding.accentColor || '#6366f1'
      appearance.signInTitle = conf.loginBranding.title || 'Welcome back'
      appearance.signInSubtitle = conf.loginBranding.subtitle || 'Sign in to your control panel'
      appearance.faviconUrl = conf.loginBranding.faviconUrl || ''
      appearance.signInLogoUrl = conf.loginBranding.logoUrl || ''
      appearance.tabName = conf.loginBranding.tabName || ''
      appearance.iconClass = conf.loginBranding.iconClass || ''
      appearance.logoUrl = conf.loginBranding.logoUrl || ''
      appearance.logoAlt = conf.loginBranding.logoAlt || ''
      appearance.heroImageUrl = conf.loginBranding.heroImageUrl || ''
      appearance.heroImageAlt = conf.loginBranding.heroImageAlt || ''
    }
    if (conf.navBranding) {
      appearance.navName = conf.navBranding.name || ''
      appearance.navIconClass = conf.navBranding.iconClass || ''
      appearance.navLogoUrl = conf.navBranding.logoUrl || ''
    }
    appearance.footerText = conf.footerText || ''
    appearance.supportText = conf.supportText || ''
    appearance.supportUrl = conf.supportUrl || ''
    appearance.dashBgUrl = conf.dashboardBgUrl || ''
    if (sec?.security) {
      security.minPasswordLength = sec.security.passwordMinLength ?? 12
      security.requireUppercase = sec.security.passwordRequireUppercase ?? true
      security.requireLowercase = sec.security.passwordRequireLowercase ?? true
      security.requireNumber = sec.security.passwordRequireNumber ?? true
      security.requireSpecial = sec.security.passwordRequireSymbol ?? true
      security.sessionTtlHours = sec.security.sessionTtlHours ?? 168
      security.maxLoginAttempts = sec.security.maxLoginAttempts ?? 5
      security.loginWindowMinutes = sec.security.loginWindowMinutes ?? 15
      security.lockoutDurationMinutes = sec.security.lockoutDurationMinutes ?? 30
      security.requireMfaAdmin = sec.security.requireMfaAdmin ?? false
      security.requireMfaNonAdmin = sec.security.requireMfaNonAdmin ?? false
    }
    if (oidcConf?.oidc) {
      oidc.enabled = oidcConf.oidc.enabled ?? false
      oidc.issuer = oidcConf.oidc.issuer || ''
      oidc.clientId = oidcConf.oidc.clientId || ''
      oidc.clientSecret = oidcConf.oidc.clientSecretSet ? '••••••••' : ''
      oidc.scopes = oidcConf.oidc.scopes || 'openid profile email'
      oidc.loginLabel = oidcConf.oidc.label || ''
      oidc.autoRegister = oidcConf.oidc.autoProvision ?? false
      oidc.allowCreation = oidcConf.oidc.allowEmailLink ?? true
      oidc.redirectUri = oidcConf.oidc.redirectUri || ''
      oidc.defaultRole = oidcConf.oidc.defaultRole || 'viewer'
      oidc.authMethod = oidcConf.oidc.authMethod || 'client_secret_post'
      oidc.allowedEmailDomains = (oidcConf.oidc.allowedEmailDomains || []).join(', ')
      oidc.allowedEmails = (oidcConf.oidc.allowedEmails || []).join(', ')
      oidc.groupClaim = oidcConf.oidc.groupClaim || 'groups'
      oidc.adminGroups = (oidcConf.oidc.adminGroups || []).join(', ')
      oidc.operatorGroups = (oidcConf.oidc.operatorGroups || []).join(', ')
      oidc.viewerGroups = (oidcConf.oidc.viewerGroups || []).join(', ')
    }
    if (ch?.chat) {
      chat.enabled = ch.chat.retentionDays > 0
    }
    if (reg) {
      registration.requireApproval = reg.requireApproval ?? false
      registration.requireRegistrationKey = reg.requireRegistrationKey ?? false
      registration.registrationKey = reg.registrationKey || ''
      registration.allowSelfRegister = reg.allowSelfRegister ?? true
      registration.defaultRole = reg.defaultRole || 'operator'
      registration.maxUsersTotal = reg.maxUsersTotal ?? 0
      registration.defaultGroupIds = Array.isArray(reg.defaultGroupIds) ? reg.defaultGroupIds.join(', ') : (reg.defaultGroupIds || '')
    }
    buildLimits.maxBuildsPerHour = brl.buildRateLimit?.maxBuildsPerHour ?? 5
    buildLimits.maxConcurrentPerUser = brl.buildRateLimit?.maxConcurrentPerUser ?? 1
    buildLimits.globalMaxConcurrent = brl.buildRateLimit?.globalMaxConcurrent ?? 3
    const iaCfg = ia.inputArchive || {}
    inputArchive.enabled = iaCfg.enabled ?? false
    inputArchive.retentionDays = iaCfg.retentionDays ?? 7
    inputArchive.maxFileBytes = iaCfg.maxFileBytes ?? 5242880
    inputArchive.pollIntervalSeconds = iaCfg.pollIntervalSeconds ?? 300
    const thumbCfg = thumb.thumbnails || {}
    thumbnails.dashboardEnabled = thumbCfg.dashboardEnabled !== false
    thumbnails.wallEnabled = thumbCfg.wallEnabled !== false
    showTlsInfo.value = !!(tls.tls?.certPath || tls.tls?.certbot?.enabled)
  } catch {} finally { loading.value = false }
}

async function saveProfile() {
  success.value = 'Profile settings saved'
}
async function changePassword() {
  if (profile.newPassword !== profile.confirmPassword) { error.value = 'Passwords do not match'; return }
  if (profile.newPassword.length < 6) { error.value = 'Password must be at least 6 characters'; return }
  saving.value = true; error.value = ''
  try { await api.put(`/api/users/${userId.value}/password`, { currentPassword: profile.currentPassword, newPassword: profile.newPassword }); success.value = 'Password changed'; profile.currentPassword = ''; profile.newPassword = ''; profile.confirmPassword = '' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function setupMfa() {
  try {
    const res = await api.post<{ secret: string; otpauthUrl: string; qrSvg: string }>('/api/mfa/setup')
    mfaUri.value = res.otpauthUrl; mfaSecret.value = res.secret; mfaQrSvg.value = res.qrSvg || ''; showMfaSetup.value = true
  } catch (e: any) { error.value = e.message }
}
async function verifyMfa() {
  if (!mfaCode.value) return
  saving.value = true; error.value = ''
  try {
    await api.post('/api/mfa/enable', { code: mfaCode.value })
    mfa.enabled = true; mfa.verified = true; showMfaSetup.value = false; mfaCode.value = ''; success.value = 'MFA enabled'
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function disableMfa() {
  if (!mfaDisablePassword.value || !mfaDisableCode.value) { error.value = 'Password and code are required'; return }
  saving.value = true; error.value = ''
  try { await api.post('/api/mfa/disable', { currentPassword: mfaDisablePassword.value, code: mfaDisableCode.value }); mfa.enabled = false; showMfaDisable.value = false; mfaDisablePassword.value = ''; mfaDisableCode.value = ''; success.value = 'MFA disabled' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveSecurity() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/security', {
    passwordMinLength: security.minPasswordLength,
    passwordRequireUppercase: security.requireUppercase,
    passwordRequireLowercase: security.requireLowercase,
    passwordRequireNumber: security.requireNumber,
    passwordRequireSymbol: security.requireSpecial,
    sessionTtlHours: security.sessionTtlHours,
    maxLoginAttempts: security.maxLoginAttempts,
    loginWindowMinutes: security.loginWindowMinutes,
    lockoutDurationMinutes: security.lockoutDurationMinutes,
    requireMfaAdmin: security.requireMfaAdmin,
    requireMfaNonAdmin: security.requireMfaNonAdmin,
  }); success.value = 'Security policy saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveOidc() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/oidc', {
    enabled: oidc.enabled,
    issuer: oidc.issuer,
    clientId: oidc.clientId,
    clientSecret: oidc.clientSecret === '••••••••' ? '' : oidc.clientSecret,
    scopes: oidc.scopes,
    label: oidc.loginLabel,
    autoProvision: oidc.autoRegister,
    allowEmailLink: oidc.allowCreation,
    redirectUri: oidc.redirectUri,
    defaultRole: oidc.defaultRole,
    authMethod: oidc.authMethod,
    allowedEmailDomains: oidc.allowedEmailDomains.split(',').map(s => s.trim()).filter(Boolean),
    allowedEmails: oidc.allowedEmails.split(',').map(s => s.trim()).filter(Boolean),
    groupClaim: oidc.groupClaim,
    adminGroups: oidc.adminGroups.split(',').map(s => s.trim()).filter(Boolean),
    operatorGroups: oidc.operatorGroups.split(',').map(s => s.trim()).filter(Boolean),
    viewerGroups: oidc.viewerGroups.split(',').map(s => s.trim()).filter(Boolean),
  }); success.value = 'OIDC settings saved'; showOidcModal.value = false } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveAppearance() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/appearance', {
    customCSS: appearance.cssOverride,
    loginBranding: {
      productName: appearance.brandName, accentColor: appearance.primaryColor,
      title: appearance.signInTitle, subtitle: appearance.signInSubtitle,
      faviconUrl: appearance.faviconUrl, loginLogoUrl: appearance.signInLogoUrl,
      tabName: appearance.tabName, iconClass: appearance.iconClass,
      logoUrl: appearance.logoUrl, logoAlt: appearance.logoAlt,
      heroImageUrl: appearance.heroImageUrl, heroImageAlt: appearance.heroImageAlt,
    },
    navBranding: { name: appearance.navName, iconClass: appearance.navIconClass, logoUrl: appearance.navLogoUrl },
    footerText: appearance.footerText, supportText: appearance.supportText, supportUrl: appearance.supportUrl,
    dashboardBgUrl: appearance.dashBgUrl,
  }); success.value = 'Appearance saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveChat() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/chat', { retentionDays: chat.enabled ? 30 : 0 }); success.value = 'Chat settings saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveInputArchive() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/input-archive', { inputArchive: { enabled: inputArchive.enabled, retentionDays: inputArchive.retentionDays, maxFileBytes: inputArchive.maxFileBytes, pollIntervalSeconds: inputArchive.pollIntervalSeconds } }); success.value = 'Input archive settings saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveThumbnails() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/thumbnails', { dashboardEnabled: thumbnails.dashboardEnabled, wallEnabled: thumbnails.wallEnabled }); success.value = 'Thumbnail settings saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveRegistration() {
  saving.value = true; error.value = ''
  try { await api.post('/api/enrollment/settings', { ...registration, defaultGroupIds: registration.defaultGroupIds ? registration.defaultGroupIds.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)) : [] }); success.value = 'Registration settings saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function saveBuildLimits() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/build-rate-limit', { maxBuildsPerHour: buildLimits.maxBuildsPerHour, maxConcurrentPerUser: buildLimits.maxConcurrentPerUser, globalMaxConcurrent: buildLimits.globalMaxConcurrent }); success.value = 'Build limits saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function exportConfig() {
  try {
    const blob = await api.downloadBlob('/api/backup/export', 'goylord-backup.zip')
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'goylord-backup.zip'; a.click(); URL.revokeObjectURL(url)
    success.value = 'Backup downloaded'
  } catch (e: any) { error.value = e.message }
}
async function importConfig() {
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.zip'
  input.onchange = async (e: any) => {
    const file = e.target.files[0]; if (!file) return
    saving.value = true; error.value = ''
    try { await api.upload('/api/backup/import', file); success.value = 'Backup restored' } catch (err: any) { error.value = err.message } finally { saving.value = false }
  }
  input.click()
}
async function loadHealth() {
  loading.value = true; error.value = ''
  try { healthData.value = await api.get('/api/settings/health') } catch (e: any) { error.value = e.message } finally { loading.value = false }
}
async function forceGC() {
  saving.value = true; error.value = ''
  try { const res = await api.post<any>('/api/settings/gc'); success.value = `GC freed ${res?.freedBytes?.toLocaleString() || 'unknown'} bytes` } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function runProfiler() {
  profilerRunning.value = true; error.value = ''
  try { profilerData.value = await api.post('/api/settings/profile', { duration: profilerDuration.value }) } catch (e: any) { error.value = e.message } finally { profilerRunning.value = false }
}
async function saveTls() {
  saving.value = true; error.value = ''
  try { await api.put('/api/settings/tls', {
    certbot: { enabled: tls.certbotEnabled, email: tls.certbotEmail, basePath: tls.certbotBasePath, domain: tls.certbotDomain, certFile: tls.certFile, keyFile: tls.keyFile, caFile: tls.caFile },
  }); success.value = 'TLS settings saved' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
async function autoSetupCertbot() {
  if (!tls.certbotDomain || !tls.certbotEmail) { error.value = 'Domain and email are required'; return }
  saving.value = true; error.value = ''
  try { await api.post('/api/settings/tls/certbot/setup', { domain: tls.certbotDomain, email: tls.certbotEmail }); success.value = 'Certbot setup completed' } catch (e: any) { error.value = e.message } finally { saving.value = false }
}
function toggleColorPick(target: string) {
  const colors = ['#6366f1','#8b5cf6','#a855f7','#ec4899','#ef4444','#f59e0b','#22c55e','#14b8a6','#06b6d4','#38bdf8']
  const el = document.getElementById(target) as HTMLInputElement
  if (el) el.click()
}

onMounted(loadAll)
</script>

<template>
  <div>
    <div class="section-header"><h1 class="section-title"><i class="fa-solid fa-gear" style="margin-right:8px;color:#94a3b8"></i>Settings</h1></div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    <template v-else>
      <div style="display:flex;gap:20px">
        <!-- Sidebar -->
        <div style="width:180px;flex-shrink:0">
          <nav style="display:flex;flex-direction:column;gap:2px;position:sticky;top:20px">
            <button v-for="s in sections" :key="s.id" @click="activeSection = s.id" class="settings-nav" :class="{'settings-nav-active': activeSection === s.id}">
              <i :class="s.icon" style="width:18px;text-align:center"></i>{{ s.label }}
            </button>
          </nav>
        </div>

        <!-- Content -->
        <div style="flex:1;min-width:0">
          <!-- Profile -->
          <div v-if="activeSection === 'profile'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Profile</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Username</label><input v-model="profile.username" class="input" style="width:100%" /></div>
              <button @click="saveProfile" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save Profile</button>
            </div>
          </div>

          <!-- Password -->
          <div v-if="activeSection === 'password'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Change Password</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Current Password</label><input v-model="profile.currentPassword" type="password" class="input" style="width:100%" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">New Password</label><input v-model="profile.newPassword" type="password" class="input" style="width:100%" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Confirm Password</label><input v-model="profile.confirmPassword" type="password" class="input" style="width:100%" /></div>
              <button @click="changePassword" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Change Password</button>
            </div>
          </div>

          <!-- MFA -->
          <div v-if="activeSection === 'mfa'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Multi-Factor Authentication</h2>
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
              <button type="button" class="toggle" :class="{active: mfa.enabled}" @click="mfa.enabled ? (showMfaDisable = true) : setupMfa()"></button>
              <span style="font-size:13px;color:#cbd5e1">{{ mfa.enabled ? 'MFA is enabled' : 'MFA is disabled' }}</span>
            </div>
            <div v-if="showMfaSetup" style="margin-bottom:16px;padding:16px;background:var(--ui-surface);border:1px solid var(--ui-border);border-radius:10px;max-width:400px">
              <p style="font-size:12px;color:#94a3b8;margin-bottom:10px">Scan this QR code with your authenticator app, then enter the code:</p>
              <div v-if="mfaQrSvg" style="background:white;border-radius:8px;padding:12px;display:inline-block;margin-bottom:10px" v-html="mfaQrSvg"></div>
              <div v-else style="background:white;border-radius:8px;padding:12px;display:inline-block;margin-bottom:10px"><img v-if="mfaUri" :src="`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(mfaUri)}`" style="width:160px;height:160px" /></div>
              <div style="font-size:11px;color:#64748b;margin-bottom:10px">Manual key: <code style="background:#1e293b;padding:2px 6px;border-radius:4px;color:#818cf8">{{ mfaSecret }}</code></div>
              <div v-if="mfaUri" style="margin-bottom:10px"><a :href="mfaUri" target="_blank" style="font-size:12px;color:#818cf8;text-decoration:underline">Open in authenticator app</a></div>
              <div style="display:flex;gap:8px">
                <input v-model="mfaCode" placeholder="Enter 6-digit code" class="input" style="width:160px" maxlength="6" />
                <button @click="verifyMfa" :disabled="saving || mfaCode.length !== 6" class="btn btn-primary btn-sm">Verify</button>
              </div>
            </div>
            <div v-if="showMfaDisable" style="margin-bottom:16px;padding:16px;background:var(--ui-surface);border:1px solid rgba(239,68,68,0.3);border-radius:10px;max-width:400px">
              <h3 style="font-size:13px;font-weight:600;color:#fca5a5;margin-bottom:10px"><i class="fa-solid fa-triangle-exclamation" style="margin-right:6px"></i>Disable MFA</h3>
              <p style="font-size:12px;color:#94a3b8;margin-bottom:10px">Enter your password and current TOTP code to disable MFA:</p>
              <div style="display:flex;flex-direction:column;gap:8px">
                <input v-model="mfaDisablePassword" type="password" placeholder="Current password" class="input" style="width:100%" />
                <input v-model="mfaDisableCode" placeholder="6-digit TOTP code" class="input" style="width:160px" maxlength="6" />
                <div style="display:flex;gap:8px">
                  <button @click="disableMfa" :disabled="saving || !mfaDisablePassword || mfaDisableCode.length !== 6" class="btn btn-danger btn-sm">Disable MFA</button>
                  <button @click="showMfaDisable = false; mfaDisablePassword = ''; mfaDisableCode = ''" class="btn btn-sm">Cancel</button>
                </div>
              </div>
            </div>
            <div v-if="mfa.enabled && mfa.backupCodes.length" style="margin-bottom:16px">
              <p style="font-size:12px;color:#94a3b8;margin-bottom:8px">Backup codes (save these):</p>
              <div style="display:flex;flex-wrap:wrap;gap:6px">
                <span v-for="code in mfa.backupCodes" :key="code" style="font-family:monospace;font-size:12px;padding:4px 8px;background:#1e293b;border:1px solid rgba(51,65,85,0.5);border-radius:6px;color:#cbd5e1">{{ code }}</span>
              </div>
            </div>
          </div>

          <!-- Security Policy -->
          <div v-if="activeSection === 'security'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Security Policy</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:480px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Min Password Length</label><input v-model.number="security.minPasswordLength" type="number" class="input" style="width:100%" min="1" max="128" /></div>
              <div v-for="k in ['requireUppercase','requireLowercase','requireNumber','requireSpecial'] as const" :key="k" style="display:flex;align-items:center;gap:8px">
                <button type="button" class="toggle" :class="{active: security[k]}" @click="(security as any)[k] = !security[k]"></button>
                <span style="font-size:13px;color:#cbd5e1;text-transform:capitalize">{{ k.replace(/([A-Z])/g, ' $1') }}</span>
              </div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Session & Lockout</h3>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Session TTL (hours)</label><input v-model.number="security.sessionTtlHours" type="number" class="input" style="width:100%" min="1" max="720" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max Login Attempts</label><input v-model.number="security.maxLoginAttempts" type="number" class="input" style="width:100%" min="1" max="50" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Login Window (minutes)</label><input v-model.number="security.loginWindowMinutes" type="number" class="input" style="width:100%" min="1" max="1440" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Lockout Duration (minutes)</label><input v-model.number="security.lockoutDurationMinutes" type="number" class="input" style="width:100%" min="1" max="1440" /></div>
              </div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">MFA Enforcement</h3>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: security.requireMfaAdmin}" @click="security.requireMfaAdmin = !security.requireMfaAdmin"></button><span style="font-size:13px;color:#cbd5e1">Require MFA for admins</span></div>
              <p style="font-size:11px;color:#64748b;margin-top:-6px">Your admin account must have MFA enabled first.</p>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: security.requireMfaNonAdmin}" @click="security.requireMfaNonAdmin = !security.requireMfaNonAdmin"></button><span style="font-size:13px;color:#cbd5e1">Require MFA for non-admins</span></div>
              <p style="font-size:11px;color:#64748b;margin-top:-6px">Applies to operator and viewer accounts.</p>
              <button @click="saveSecurity" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- TLS -->
          <div v-if="activeSection === 'tls'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">TLS / Certbot</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:500px">
              <div style="display:flex;align-items:center;gap:10px;padding:12px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:10px">
                <i class="fa-solid fa-certificate" :style="{color: showTlsInfo ? '#22c55e' : '#64748b', fontSize:'16px'}"></i>
                <span style="font-size:13px;color:#cbd5e1">{{ showTlsInfo ? 'TLS is enabled' : 'TLS is not configured' }}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: tls.certbotEnabled}" @click="tls.certbotEnabled = !tls.certbotEnabled"></button><span style="font-size:13px;color:#cbd5e1">Use Certbot certificates</span></div>
              <p style="font-size:11px;color:#64748b;margin-top:-6px">Use certbot certificates in production runtime (NODE_ENV=production)</p>
              <div v-if="tls.certbotEnabled" style="display:flex;flex-direction:column;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Let's Encrypt Account Email</label><input v-model="tls.certbotEmail" type="email" class="input" style="width:100%" placeholder="admin@example.com" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Certbot Domain</label><input v-model="tls.certbotDomain" class="input" style="width:100%" placeholder="example.com" /></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                  <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Live Base Path</label><input v-model="tls.certbotBasePath" class="input" style="width:100%" /></div>
                  <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Cert File</label><input v-model="tls.certFile" class="input" style="width:100%" /></div>
                  <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Key File</label><input v-model="tls.keyFile" class="input" style="width:100%" /></div>
                  <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">CA Chain File</label><input v-model="tls.caFile" class="input" style="width:100%" /></div>
                </div>
                <div style="display:flex;gap:8px">
                  <button @click="autoSetupCertbot" :disabled="saving || !tls.certbotDomain || !tls.certbotEmail" class="btn btn-success btn-sm"><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:4px"></i>Auto Setup Free SSL</button>
                </div>
              </div>
              <div style="display:flex;gap:8px">
                <button @click="saveTls" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save TLS Settings</button>
                <a href="/api/tls/export?format=zip" class="btn btn-sm"><i class="fa-solid fa-download" style="margin-right:4px"></i>Download Certs</a>
              </div>
            </div>
          </div>

          <!-- OIDC -->
          <div v-if="activeSection === 'oidc'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">OpenID Connect (OIDC)</h2>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
              <button type="button" class="toggle" :class="{active: oidc.enabled}" @click="oidc.enabled = !oidc.enabled"></button>
              <span style="font-size:13px;color:#cbd5e1">{{ oidc.enabled ? 'OIDC is enabled' : 'OIDC is disabled' }}</span>
            </div>
            <div v-if="oidc.enabled" style="display:flex;flex-direction:column;gap:10px;max-width:520px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Issuer URL</label><input v-model="oidc.issuer" class="input" style="width:100%" placeholder="https://accounts.google.com" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Redirect URI</label><input v-model="oidc.redirectUri" class="input" style="width:100%" placeholder="https://goylord.example.com/api/oidc/callback" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Client ID</label><input v-model="oidc.clientId" class="input" style="width:100%" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Client Secret</label><input v-model="oidc.clientSecret" type="password" class="input" style="width:100" /><p style="font-size:11px;color:#64748b;margin-top:3px">{{ oidc.clientSecret === '••••••••' ? 'A client secret is saved. Leave blank to keep it.' : 'No client secret is currently saved.' }}</p></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Scopes</label><input v-model="oidc.scopes" class="input" style="width:100%" /></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Client Auth Method</label>
                  <AppSelect v-model="oidc.authMethod" :options="[{ value: 'client_secret_post', label: 'Client secret POST' }, { value: 'client_secret_basic', label: 'Client secret basic' }, { value: 'none', label: 'None (PKCE only)' }]" />
                </div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Default Role</label>
                  <AppSelect v-model="oidc.defaultRole" :options="[{ value: 'viewer', label: 'Viewer' }, { value: 'operator', label: 'Operator' }, { value: 'admin', label: 'Admin' }]" />
                </div>
              </div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Login Button Label</label><input v-model="oidc.loginLabel" class="input" style="width:100%" placeholder="Sign in with SSO" /></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: oidc.autoRegister}" @click="oidc.autoRegister = !oidc.autoRegister"></button><span style="font-size:13px;color:#cbd5e1">Auto-register new users</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: oidc.allowCreation}" @click="oidc.allowCreation = !oidc.allowCreation"></button><span style="font-size:13px;color:#cbd5e1">Allow account creation</span></div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Access Control</h3>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Allowed Email Domains (comma-separated)</label><input v-model="oidc.allowedEmailDomains" class="input" style="width:100%" placeholder="example.com, example.org" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Allowed Email Addresses (comma-separated)</label><input v-model="oidc.allowedEmails" class="input" style="width:100%" placeholder="admin@example.com" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Group Claim</label><input v-model="oidc.groupClaim" class="input" style="width:100%" placeholder="groups" /></div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Admin Groups</label><input v-model="oidc.adminGroups" class="input" style="width:100%" placeholder="goylord-admins" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Operator Groups</label><input v-model="oidc.operatorGroups" class="input" style="width:100%" placeholder="goylord-operators" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Viewer Groups</label><input v-model="oidc.viewerGroups" class="input" style="width:100%" placeholder="goylord-viewers" /></div>
              </div>
              <button @click="saveOidc" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save OIDC</button>
            </div>
          </div>

          <!-- Appearance -->
          <div v-if="activeSection === 'appearance'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Appearance</h2>
            <div style="display:flex;flex-direction:column;gap:14px;max-width:520px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Brand Name</label><input v-model="appearance.brandName" class="input" style="width:100%" /></div>
              <div style="display:flex;gap:12px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Primary Color</label>
                  <div style="display:flex;align-items:center;gap:6px"><input id="pc" type="color" v-model="appearance.primaryColor" style="width:36px;height:30px;border:none;background:none;cursor:pointer;border-radius:6px" /><span style="font-size:11px;color:#64748b;font-family:monospace">{{ appearance.primaryColor }}</span></div></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Accent Color</label>
                  <div style="display:flex;align-items:center;gap:6px"><input id="ac" type="color" v-model="appearance.accentColor" style="width:36px;height:30px;border:none;background:none;cursor:pointer;border-radius:6px" /><span style="font-size:11px;color:#64748b;font-family:monospace">{{ appearance.accentColor }}</span></div></div>
              </div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Sign-In Page</h3>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Title</label><input v-model="appearance.signInTitle" class="input" style="width:100%" placeholder="Welcome back" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Subtitle</label><input v-model="appearance.signInSubtitle" class="input" style="width:100%" placeholder="Sign in to your control panel" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Sign-In Logo URL</label><input v-model="appearance.signInLogoUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Logo Alt Text</label><input v-model="appearance.logoAlt" class="input" style="width:100%" placeholder="Logo description" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Hero Image URL</label><input v-model="appearance.heroImageUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Hero Image Alt Text</label><input v-model="appearance.heroImageAlt" class="input" style="width:100%" placeholder="Hero image description" /></div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Navigation</h3>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Browser Tab Title</label><input v-model="appearance.tabName" class="input" style="width:100%" placeholder="Goylord" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Favicon URL</label><input v-model="appearance.faviconUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Navigation Name</label><input v-model="appearance.navName" class="input" style="width:100%" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Nav Icon Class</label><input v-model="appearance.iconClass" class="input" style="width:100%" placeholder="fa-solid fa-crown" /></div>
              </div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Navigation Logo URL</label><input v-model="appearance.navLogoUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Footer & Support</h3>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Footer Text</label><input v-model="appearance.footerText" class="input" style="width:100%" placeholder="Authorized access only" /></div>
                <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Support Link Text</label><input v-model="appearance.supportText" class="input" style="width:100%" placeholder="Need help?" /></div>
              </div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Support URL</label><input v-model="appearance.supportUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Dashboard Background Image URL</label><input v-model="appearance.dashBgUrl" class="input" style="width:100%" placeholder="https://..." /></div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Custom CSS Override</label>
                <textarea v-model="appearance.cssOverride" rows="6" class="input" style="width:100%;font-family:monospace;font-size:12px;resize:vertical" spellcheck="false" placeholder="/* Custom CSS */"></textarea></div>
              <button @click="saveAppearance" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save Appearance</button>
            </div>
          </div>

          <!-- Chat -->
          <div v-if="activeSection === 'chat'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Chat</h2>
            <div style="display:flex;flex-direction:column;gap:10px;max-width:400px">
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: chat.enabled}" @click="chat.enabled = !chat.enabled"></button><span style="font-size:13px;color:#cbd5e1">Enable Chat</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: chat.autoScroll}" @click="chat.autoScroll = !chat.autoScroll"></button><span style="font-size:13px;color:#cbd5e1">Auto-scroll</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: chat.showTimestamps}" @click="chat.showTimestamps = !chat.showTimestamps"></button><span style="font-size:13px;color:#cbd5e1">Show Timestamps</span></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max History</label><input v-model.number="chat.maxHistory" type="number" class="input" style="width:120px" /></div>
              <button @click="saveChat" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- Thumbnails -->
          <div v-if="activeSection === 'thumbnails'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Thumbnails</h2>
            <div style="display:flex;flex-direction:column;gap:10px;max-width:400px">
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: thumbnails.dashboardEnabled}" @click="thumbnails.dashboardEnabled = !thumbnails.dashboardEnabled"></button><span style="font-size:13px;color:#cbd5e1">Dashboard Thumbnails</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: thumbnails.wallEnabled}" @click="thumbnails.wallEnabled = !thumbnails.wallEnabled"></button><span style="font-size:13px;color:#cbd5e1">Screenshot Wall Thumbnails</span></div>
              <button @click="saveThumbnails" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- Input Archive -->
          <div v-if="activeSection === 'inputArchive'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Input Archive</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: inputArchive.enabled}" @click="inputArchive.enabled = !inputArchive.enabled"></button><span style="font-size:13px;color:#cbd5e1">Enable Input Archive</span></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Retention Days</label><input v-model.number="inputArchive.retentionDays" type="number" class="input" style="width:100%" min="1" max="365" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max File Size (bytes)</label><input v-model.number="inputArchive.maxFileBytes" type="number" class="input" style="width:100%" min="1048576" max="52428800" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Poll Interval (seconds)</label><input v-model.number="inputArchive.pollIntervalSeconds" type="number" class="input" style="width:100%" min="0" max="86400" /></div>
              <button @click="saveInputArchive" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- Registration -->
          <div v-if="activeSection === 'registration'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Registration / Enrollment</h2>
            <div style="display:flex;flex-direction:column;gap:10px;max-width:400px">
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: registration.requireApproval}" @click="registration.requireApproval = !registration.requireApproval"></button><span style="font-size:13px;color:#cbd5e1">Require Approval</span></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: registration.requireRegistrationKey}" @click="registration.requireRegistrationKey = !registration.requireRegistrationKey"></button><span style="font-size:13px;color:#cbd5e1">Require Registration Key</span></div>
              <div v-if="registration.requireRegistrationKey"><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Registration Key</label><input v-model="registration.registrationKey" class="input" style="width:100%" /></div>
              <div style="display:flex;align-items:center;gap:8px"><button type="button" class="toggle" :class="{active: registration.allowSelfRegister}" @click="registration.allowSelfRegister = !registration.allowSelfRegister"></button><span style="font-size:13px;color:#cbd5e1">Allow Self-Register (Web)</span></div>
              <div style="border-top:1px solid var(--ui-border);padding-top:12px;margin-top:4px"></div>
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8">Defaults</h3>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Default Role</label>
                <AppSelect v-model="registration.defaultRole" :options="[{ value: 'operator', label: 'Operator' }, { value: 'viewer', label: 'Viewer' }]" />
              </div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max Users (0 = unlimited)</label><input v-model.number="registration.maxUsersTotal" type="number" class="input" style="width:100%" min="0" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Default Group IDs (comma-separated)</label><input v-model="registration.defaultGroupIds" class="input" style="width:100%" placeholder="1, 2, 3" /></div>
              <button @click="saveRegistration" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- Build Limits -->
          <div v-if="activeSection === 'builds'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Build Rate Limits</h2>
            <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max Builds Per Hour</label><input v-model.number="buildLimits.maxBuildsPerHour" type="number" class="input" style="width:100%" min="1" max="100" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Max Concurrent Per User</label><input v-model.number="buildLimits.maxConcurrentPerUser" type="number" class="input" style="width:100%" min="1" max="10" /></div>
              <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Global Max Concurrent</label><input v-model.number="buildLimits.globalMaxConcurrent" type="number" class="input" style="width:100%" min="1" max="20" /></div>
              <button @click="saveBuildLimits" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button>
            </div>
          </div>

          <!-- Backup -->
          <div v-if="activeSection === 'backup'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Export / Import</h2>
            <div style="display:flex;gap:12px">
              <button @click="exportConfig" class="btn btn-sm" style="display:flex;align-items:center;gap:6px"><i class="fa-solid fa-download"></i> Export Backup (.zip)</button>
              <button @click="importConfig" :disabled="saving" class="btn btn-sm" style="display:flex;align-items:center;gap:6px"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i><i v-else class="fa-solid fa-upload"></i> Import Backup</button>
            </div>
            <p style="font-size:12px;color:#64748b;margin-top:10px">Export includes config, scripts, settings, and build profiles. Import restores from a .zip file.</p>
          </div>

          <!-- Health -->
          <div v-if="activeSection === 'health'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Server Health</h2>
            <div style="display:flex;gap:8px;margin-bottom:14px">
              <button @click="loadHealth" :disabled="loading" class="btn btn-primary btn-sm"><i :class="loading ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-heart-pulse'" style="margin-right:6px"></i> Refresh</button>
              <button @click="forceGC" :disabled="saving" class="btn btn-danger btn-sm"><i :class="saving ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-broom'" style="margin-right:6px"></i> Force GC</button>
            </div>
            <div v-if="healthData?.memory" style="margin-bottom:14px">
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Memory</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">
                <div v-for="(val, key) in healthData.memory" :key="String(key)" style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
                  <div style="font-size:10px;color:#64748b;text-transform:capitalize">{{ String(key).replace(/([A-Z])/g, ' $1') }}</div>
                  <div style="font-size:14px;font-weight:600;color:#e2e8f0;font-family:monospace">{{ typeof val === 'number' ? `${(val / 1048576).toFixed(1)} MB` : String(val) }}</div>
                </div>
              </div>
            </div>
            <div v-if="healthData?.components" style="margin-bottom:14px">
              <h3 style="font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:8px">Components</h3>
              <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px">
                <div style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
                  <div style="font-size:10px;color:#64748b">Clients In-Memory</div>
                  <div style="font-size:14px;font-weight:600;color:#e2e8f0">{{ healthData.components.clients?.inMemory ?? '-' }}</div>
                </div>
                <div style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
                  <div style="font-size:10px;color:#64748b">Clients Online</div>
                  <div style="font-size:14px;font-weight:600;color:#22c55e">{{ healthData.components.clients?.online ?? '-' }}</div>
                </div>
                <div style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
                  <div style="font-size:10px;color:#64748b">DB File Size</div>
                  <div style="font-size:14px;font-weight:600;color:#e2e8f0">{{ healthData.components.database?.fileSizeBytes ? `${(healthData.components.database.fileSizeBytes / 1048576).toFixed(1)} MB` : '-' }}</div>
                </div>
                <div v-if="healthData.uptime" style="padding:10px;background:rgba(15,23,42,0.6);border:1px solid rgba(51,65,85,0.4);border-radius:8px">
                  <div style="font-size:10px;color:#64748b">Uptime</div>
                  <div style="font-size:14px;font-weight:600;color:#e2e8f0">{{ `${(healthData.uptime / 3600).toFixed(1)}h` }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Profiler -->
          <div v-if="activeSection === 'profiler'" class="settings-panel">
            <h2 style="font-size:14px;font-weight:600;color:#e2e8f0;margin-bottom:16px">Server Profiler</h2>
            <p style="font-size:12px;color:#64748b;margin-bottom:12px">Runs a CPU profile and returns top hot functions.</p>
            <div style="display:flex;gap:8px;margin-bottom:14px;align-items:center">
              <label style="font-size:11px;color:#94a3b8">Duration:</label>
              <AppSelect v-model="profilerDuration" :options="[{ value: 3, label: '3s' }, { value: 5, label: '5s' }, { value: 10, label: '10s' }, { value: 30, label: '30s' }]" style="width:80px" />
              <button @click="runProfiler" :disabled="profilerRunning" class="btn btn-primary btn-sm"><i :class="profilerRunning ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-gauge-high'" style="margin-right:6px"></i> {{ profilerRunning ? 'Profiling...' : 'Run Profile' }}</button>
            </div>
            <div v-if="profilerData" style="background:#0f172a;border:1px solid rgba(51,65,85,0.5);border-radius:10px;padding:12px;max-height:400px;overflow-y:auto">
              <pre style="font-size:11px;color:#94a3b8;white-space:pre-wrap;font-family:monospace;margin:0">{{ JSON.stringify(profilerData, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.settings-nav { display:flex; align-items:center; gap:8px; padding:7px 12px; font-size:13px; color:#64748b; background:transparent; border:none; border-radius:8px; cursor:pointer; transition:all 140ms ease; text-align:left; }
.settings-nav:hover { background:rgba(51,65,85,0.2); color:#94a3b8; }
.settings-nav-active { background:rgba(99,102,241,0.12); color:#818cf8; }
.settings-panel { animation:fadeIn 150ms ease; }
</style>
