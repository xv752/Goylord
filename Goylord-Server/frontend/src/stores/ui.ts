import { defineStore } from "pinia";
import { ref } from "vue";

export interface Toast {
  id: number;
  message: string;
  type: "success" | "error" | "info";
  duration?: number;
}

let nextId = 0;

export const useUiStore = defineStore("ui", () => {
  const sidebarCollapsed = ref(false);
  const toasts = ref<Toast[]>([]);

  function toggleSidebar() { sidebarCollapsed.value = !sidebarCollapsed.value; }

  function toast(message: string, type: Toast["type"] = "info", duration = 4000) {
    const id = nextId++;
    toasts.value.push({ id, message, type, duration });
    if (duration > 0) {
      setTimeout(() => { toasts.value = toasts.value.filter(t => t.id !== id); }, duration);
    }
  }

  function removeToast(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { sidebarCollapsed, toasts, toggleSidebar, toast, removeToast };
});
