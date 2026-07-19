<script setup lang="ts">
import { useUiStore } from "@/stores/ui";
import Sidebar from "./Sidebar.vue";
import Toast from "@/components/ui/Toast.vue";

const ui = useUiStore();
</script>

<template>
  <div class="app-layout">
    <Sidebar />
    <div class="app-main" :class="{ 'app-main-collapsed': ui.sidebarCollapsed }">
      <header class="topbar">
        <button @click="ui.toggleSidebar" class="topbar-toggle">
          <i class="fa-solid fa-bars"></i>
        </button>
        <span class="topbar-brand">Goylord</span>
      </header>
      <main class="app-content">
        <RouterView />
      </main>
    </div>
    <Toast />
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  background: #0a0d14;
  color: #e8edf2;
}

.app-main {
  flex: 1;
  min-width: 0;
  margin-left: 224px;
  transition: margin-left 240ms cubic-bezier(0.4, 0, 0.2, 1);
}
.app-main-collapsed {
  margin-left: 64px;
}

.topbar {
  position: sticky; top: 0; z-index: 30;
  display: flex; align-items: center; gap: 14px;
  padding: 14px 20px;
  background: rgba(8, 12, 24, 0.72);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
  backdrop-filter: blur(8px);
}
.topbar-toggle {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px;
  background: transparent; border: none;
  color: #7c8fa3;
  transition: all 140ms ease;
}
.topbar-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}
.topbar-brand {
  font-size: 0.875rem; font-weight: 500;
  color: #94a3b8;
}

.app-content {
  padding: 20px;
}
</style>
