import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { authApi } from "@/api/client";
import type { User } from "@/api/types";

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const loading = ref(false);

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.role === "admin");
  const isOperator = computed(() => user.value?.role === "admin" || user.value?.role === "operator");
  const isViewer = computed(() => user.value?.role === "viewer");

  async function login(username: string, password: string) {
    loading.value = true;
    try {
      const res = await authApi.login({ user: username, pass: password });
      if (res.ok) {
        // Login response has user in body AND sets goylord_token cookie via Set-Cookie
        if (res.user) {
          user.value = res.user;
        }
        // Always fetch fresh user data to populate store from cookie
        await fetchUser();
        return { ok: true };
      }
      return { ok: false, error: res.error || "Login failed" };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
    } finally {
      loading.value = false;
    }
  }

  async function fetchUser() {
    try {
      // GET /api/auth/me returns flat: { username, role, userId, canBuild, mustChangePassword, ... }
      // NOT { user: {...} } — the API does NOT nest it
      const res: Record<string, unknown> = await authApi.me();
      if (res && res.username) {
        user.value = {
          id: res.userId as number,
          username: res.username as string,
          role: res.role as "admin" | "operator" | "viewer",
          canBuild: res.canBuild as boolean,
          canUploadFiles: res.canUploadFiles as boolean,
          featurePermissions: res.featurePermissions as Record<string, boolean>,
        };
      } else {
        user.value = null;
      }
    } catch {
      user.value = null;
    }
  }

  async function logout() {
    try { await authApi.logout(); } catch { /* silent */ }
    user.value = null;
  }

  return { user, loading, isAuthenticated, isAdmin, isOperator, isViewer, login, fetchUser, logout };
});
