<script setup lang="ts">
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { NAV_GROUPS } from "@/lib/constants";

const route = useRoute();
const router = useRouter();
const ui = useUiStore();
const auth = useAuthStore();

function isActive(path: string): boolean {
  if (path === "/") return route.path === "/";
  return route.path === path || route.path.startsWith(path + "/");
}

function canAccess(item: (typeof NAV_GROUPS)[0]["items"][0]): boolean {
  if (!item.access) return true;
  if (!auth.user) return false;
  if (item.access === "no-viewer") return auth.user.role !== "viewer";
  if (item.access === "admin") return auth.user.role === "admin";
  if (item.access === "admin-or-operator") return auth.user.role === "admin" || auth.user.role === "operator";
  return true;
}

async function handleLogout() {
  await auth.logout();
  router.push("/login");
}
</script>

<template>
  <aside
    class="sb"
    :class="ui.sidebarCollapsed ? 'sb-collapsed' : ''"
  >
    <div class="sb-inner">
      <!-- Logo -->
      <div class="sb-logo">
        <span class="sb-logo-icon">G</span>
        <span v-if="!ui.sidebarCollapsed" class="sb-logo-text">Goylord</span>
      </div>

      <!-- Navigation -->
      <nav class="sb-nav">
        <div v-for="group in NAV_GROUPS" :key="group.label" class="sb-group">
          <p v-if="!ui.sidebarCollapsed" class="sb-group-label">{{ group.label }}</p>
          <div v-for="item in group.items" :key="item.path">
            <router-link
              v-if="canAccess(item)"
              :to="item.path"
              class="sb-link"
              :class="{ 'sb-link-active': isActive(item.path) }"
            >
              <i :class="[item.icon, item.iconColor]" class="sb-link-icon"></i>
              <span v-if="!ui.sidebarCollapsed" class="sb-link-text">{{ item.label }}</span>
            </router-link>
          </div>
        </div>
      </nav>

      <!-- Footer: user + settings + logout -->
      <div class="sb-footer">
        <div class="sb-user">
          <div class="sb-avatar">{{ auth.user?.username?.[0]?.toUpperCase() || "?" }}</div>
          <div v-if="!ui.sidebarCollapsed" class="sb-user-info">
            <p class="sb-user-name">{{ auth.user?.username }}</p>
            <p class="sb-user-role">{{ auth.user?.role }}</p>
          </div>
        </div>
        <router-link to="/settings" class="sb-link">
          <i class="fa-solid fa-gear sb-link-icon"></i>
          <span v-if="!ui.sidebarCollapsed" class="sb-link-text">Settings</span>
        </router-link>
        <button @click="handleLogout" class="sb-link sb-link-danger">
          <i class="fa-solid fa-right-from-bracket sb-link-icon"></i>
          <span v-if="!ui.sidebarCollapsed" class="sb-link-text">Logout</span>
        </button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.sb {
  position: fixed; top: 0; left: 0; z-index: 50;
  width: 224px; height: 100dvh;
  background: rgba(2, 8, 22, 0.97);
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(4px);
  transition: width 240ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}
.sb-collapsed {
  width: 64px;
}

.sb-inner {
  display: flex; flex-direction: column;
  height: 100%;
}

/* Logo */
.sb-logo {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.sb-logo-icon {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f6bff, #715dff);
  color: #fff; font-weight: 700; font-size: 14px;
  flex-shrink: 0;
}
.sb-logo-text {
  font-size: 0.95rem; font-weight: 600; color: #f1f5f9;
  white-space: nowrap;
}

/* Nav */
.sb-nav {
  flex: 1; overflow-y: auto; overflow-x: hidden;
  padding: 8px;
}
.sb-group {
  margin-bottom: 4px;
}
.sb-group-label {
  padding: 6px 12px 4px;
  font-size: 10px; text-transform: uppercase;
  letter-spacing: 0.06em; font-weight: 600;
  color: #475569;
  white-space: nowrap;
}
.sb-link {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px;
  border-radius: 9px;
  color: #7c8fa3;
  font-size: 0.875rem; font-weight: 500;
  transition: background 140ms, color 140ms;
  white-space: nowrap;
  text-decoration: none;
}
.sb-link:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}
.sb-link-active {
  background: rgba(99, 102, 241, 0.14);
  color: #e2e8f0;
}
.sb-link-active:hover {
  background: rgba(99, 102, 241, 0.2);
}
.sb-link-icon {
  width: 20px; text-align: center; font-size: 0.875rem;
  flex-shrink: 0;
}
.sb-link-text {
  overflow: hidden;
}
.sb-link-danger {
  color: #f87171;
}
.sb-link-danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #fca5a5;
}

/* Footer */
.sb-footer {
  padding: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}
.sb-user {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
}
.sb-avatar {
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%;
  background: rgba(99, 102, 241, 0.18);
  color: #c7d2fe;
  font-size: 12px; font-weight: 600;
  flex-shrink: 0;
}
.sb-user-info {
  overflow: hidden;
}
.sb-user-name {
  font-size: 0.8125rem; font-weight: 500; color: #e2e8f0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sb-user-role {
  font-size: 10px; text-transform: capitalize; color: #64748b;
}

/* Collapsed overrides */
.sb-collapsed .sb-link {
  justify-content: center; padding: 12px 0; gap: 0;
}
.sb-collapsed .sb-link-icon {
  font-size: 1.05rem;
}
.sb-collapsed .sb-group-label {
  display: none;
}
.sb-collapsed .sb-logo {
  justify-content: center; padding: 16px 8px 14px;
}
.sb-collapsed .sb-user {
  justify-content: center; padding: 10px 8px;
}
</style>
