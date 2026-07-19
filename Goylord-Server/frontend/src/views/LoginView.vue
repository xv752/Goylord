<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();
const username = ref("");
const password = ref("");
const error = ref("");
const loading = ref(false);

async function handleLogin() {
  if (!username.value || !password.value) {
    error.value = "Username and password required";
    return;
  }
  loading.value = true;
  error.value = "";
  const result = await auth.login(username.value, password.value);
  loading.value = false;
  if (result.ok) {
    router.push("/");
  } else {
    error.value = result.error || "Login failed";
  }
}
</script>

<template>
  <div class="login-body">
    <div class="login-card">
      <div class="login-brand">
        <div class="login-logo">G</div>
        <h1 class="login-title">Goylord</h1>
        <p class="login-sub">Remote Management</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="login-field">
          <label class="login-label">Username</label>
          <div class="login-input-wrap">
            <i class="fa-solid fa-user login-input-icon"></i>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              autofocus
              class="login-input"
              placeholder="Enter username"
            />
          </div>
        </div>

        <div class="login-field">
          <label class="login-label">Password</label>
          <div class="login-input-wrap">
            <i class="fa-solid fa-lock login-input-icon"></i>
            <input
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="login-input"
              placeholder="Enter password"
            />
          </div>
        </div>

        <div v-if="error" class="login-error">
          <i class="fa-solid fa-circle-exclamation"></i>
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="login-btn"
        >
          <span v-if="loading"><i class="fa-solid fa-spinner fa-spin mr-2"></i>Signing in...</span>
          <span v-else>Sign In</span>
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-body {
  min-height: 100vh;
  display: flex; align-items: center; justify-content: center;
  background: #05070f;
  padding: 20px;
}

.login-card {
  width: min(420px, 90vw);
  background: linear-gradient(145deg, rgba(40,55,90,0.4), rgba(20,26,40,0.85));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  padding: 40px 32px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 100px rgba(92, 145, 255, 0.1);
  backdrop-filter: blur(12px);
}

.login-brand {
  text-align: center;
  margin-bottom: 36px;
}
.login-logo {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f6bff, #715dff);
  color: #fff; font-weight: 700; font-size: 22px;
}
.login-title {
  font-size: 28px; font-weight: 700;
  background: linear-gradient(135deg, #e8edf2, #94a3b8);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}
.login-sub {
  font-size: 14px; color: #64748b;
  margin-top: 4px;
}

.login-form {
  display: flex; flex-direction: column; gap: 20px;
}

.login-field {
  display: flex; flex-direction: column; gap: 8px;
}
.login-label {
  font-size: 13px; font-weight: 500;
  color: #94a3b8;
}

.login-input-wrap {
  display: flex; align-items: center; gap: 12px;
  padding: 13px 16px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  transition: all 200ms ease;
}
.login-input-wrap:focus-within {
  border-color: rgba(100, 116, 139, 0.82);
  background: rgba(255, 255, 255, 0.08);
}
.login-input-icon {
  color: #7a8cb5; font-size: 15px;
  flex-shrink: 0;
}
.login-input-wrap:focus-within .login-input-icon {
  color: #94a3b8;
}
.login-input {
  flex: 1;
  background: transparent; border: none;
  color: #e8edf2; font-size: 15px; outline: none;
}
.login-input::placeholder {
  color: #6b7a98;
}

.login-error {
  padding: 10px 14px;
  border-radius: 10px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #fca5a5;
  font-size: 0.875rem;
  display: flex; align-items: center; gap: 8px;
}

.login-btn {
  padding: 13px;
  border-radius: 14px;
  border: none;
  background: linear-gradient(120deg, #4f6bff, #715dff);
  color: #fff;
  font-size: 15px; font-weight: 600;
  cursor: pointer;
  transition: all 200ms ease;
  box-shadow: 0 10px 24px rgba(79, 70, 229, 0.35);
}
.login-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px rgba(122, 91, 255, 0.4);
}
.login-btn:disabled {
  opacity: 0.5; cursor: not-allowed;
}
</style>
