<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api } from '../lib/api'

interface User {
  id: number
  username: string
  role: string
  canBuild: boolean
  canUploadFiles: boolean
}

const users = ref<User[]>([])
const loading = ref(true)
const showCreate = ref(false)
const editingUser = ref<User | null>(null)
const createForm = ref({ username: '', password: '', role: 'operator' })
const editForm = ref({ role: '', canBuild: false, canUploadFiles: false })
const error = ref('')
const success = ref('')
const deleteConfirmId = ref<number | null>(null)

async function loadUsers() {
  loading.value = true
  try {
    const data = await api.get<User[]>('/api/users')
    users.value = data
  } catch (e: any) {
    error.value = e.message || 'Failed to load users'
  } finally {
    loading.value = false
  }
}

async function createUser() {
  error.value = ''; success.value = ''
  try {
    await api.post('/api/users', createForm.value)
    success.value = 'User created'
    showCreate.value = false
    createForm.value = { username: '', password: '', role: 'operator' }
    await loadUsers()
  } catch (e: any) { error.value = e.message || 'Failed to create user' }
}

function startEdit(user: User) {
  editingUser.value = user
  editForm.value = { role: user.role, canBuild: user.canBuild, canUploadFiles: user.canUploadFiles }
}

async function saveEdit() {
  if (!editingUser.value) return
  error.value = ''
  try {
    await api.patch(`/api/users/${editingUser.value.id}`, editForm.value)
    success.value = 'User updated'; editingUser.value = null; await loadUsers()
  } catch (e: any) { error.value = e.message || 'Failed to update user' }
}

async function deleteUser(id: number) {
  error.value = ''
  try {
    await api.delete(`/api/users/${id}`)
    success.value = 'User deleted'; deleteConfirmId.value = null; await loadUsers()
  } catch (e: any) { error.value = e.message || 'Failed to delete user' }
}

function roleBadge(role: string) {
  if (role === 'admin') return 'badge-danger'
  if (role === 'operator') return 'badge-info'
  return 'badge'
}

onMounted(loadUsers)
</script>

<template>
  <div>
    <div class="section-header">
      <h1 class="section-title">Users</h1>
      <button @click="showCreate = !showCreate" class="btn btn-primary btn-sm">
        <i class="fa-solid fa-plus"></i> New User
      </button>
    </div>

    <div v-if="error" class="alert alert-error" style="margin-bottom:16px">
      <i class="fa-solid fa-circle-exclamation"></i> {{ error }}
    </div>
    <div v-if="success" class="alert alert-success" style="margin-bottom:16px">
      <i class="fa-solid fa-check-circle"></i> {{ success }}
    </div>

    <div v-if="showCreate" class="panel" style="margin-bottom:24px">
      <h2 style="font-size:0.875rem;font-weight:500;color:#cbd5e1;margin-bottom:12px">Create User</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px">
        <input v-model="createForm.username" placeholder="Username" class="input" />
        <input v-model="createForm.password" type="password" placeholder="Password" class="input" />
        <select v-model="createForm.role" class="input">
          <option value="admin">Admin</option>
          <option value="operator">Operator</option>
          <option value="viewer">Viewer</option>
        </select>
        <button @click="createUser" :disabled="!createForm.username || !createForm.password" class="btn btn-success btn-sm">Create</button>
      </div>
    </div>

    <div v-if="editingUser" class="panel" style="margin-bottom:24px">
      <h2 style="font-size:0.875rem;font-weight:500;color:#cbd5e1;margin-bottom:12px">Edit: {{ editingUser.username }}</h2>
      <div style="display:flex;flex-wrap:wrap;align-items:end;gap:16px">
        <div>
          <label style="display:block;font-size:12px;color:#94a3b8;margin-bottom:6px">Role</label>
          <select v-model="editForm.role" class="input">
            <option value="admin">Admin</option>
            <option value="operator">Operator</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;color:#cbd5e1;cursor:pointer">
          <input type="checkbox" v-model="editForm.canBuild" /> Can Build
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:0.875rem;color:#cbd5e1;cursor:pointer">
          <input type="checkbox" v-model="editForm.canUploadFiles" /> Can Upload Files
        </label>
        <button @click="saveEdit" class="btn btn-primary btn-sm">Save</button>
        <button @click="editingUser = null" class="btn btn-sm">Cancel</button>
      </div>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Can Build</th>
            <th>Can Upload</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading">
            <td colspan="5" class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Loading...</td>
          </tr>
          <tr v-else-if="users.length === 0">
            <td colspan="5" class="empty-state">No users found</td>
          </tr>
          <tr v-for="user in users" :key="user.id" @click="startEdit(user)" style="cursor:pointer">
            <td style="font-weight:500;color:#e2e8f0">{{ user.username }}</td>
            <td><span :class="['badge', 'badge-sm', roleBadge(user.role)]">{{ user.role }}</span></td>
            <td><i :class="user.canBuild ? 'fa-solid fa-check' : 'fa-solid fa-xmark'" :style="{ color: user.canBuild ? '#4ade80' : '#475569' }"></i></td>
            <td><i :class="user.canUploadFiles ? 'fa-solid fa-check' : 'fa-solid fa-xmark'" :style="{ color: user.canUploadFiles ? '#4ade80' : '#475569' }"></i></td>
            <td style="text-align:right">
              <template v-if="deleteConfirmId === user.id">
                <span style="font-size:12px;color:#94a3b8;margin-right:8px">Delete?</span>
                <button @click.stop="deleteUser(user.id)" class="btn btn-danger btn-sm" style="padding:4px 10px;font-size:12px">Yes</button>
                <button @click.stop="deleteConfirmId = null" class="btn btn-sm" style="padding:4px 10px;font-size:12px">No</button>
              </template>
              <template v-else>
                <button @click.stop="startEdit(user)" class="btn-icon-sm" title="Edit"><i class="fa-solid fa-pen" style="font-size:11px"></i></button>
                <button @click.stop="deleteConfirmId = user.id" class="btn-icon-sm" title="Delete" style="margin-left:6px;color:#f87171"><i class="fa-solid fa-trash" style="font-size:11px"></i></button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
