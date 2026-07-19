<script setup lang="ts">
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
</script>

<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          class="toast"
          :class="{
            'toast-success': toast.type === 'success',
            'toast-error': toast.type === 'error',
            'toast-info': toast.type === 'info',
          }"
        >
          <div class="toast-icon">
            <i v-if="toast.type === 'success'" class="fa-solid fa-check"></i>
            <i v-else-if="toast.type === 'error'" class="fa-solid fa-xmark"></i>
            <i v-else class="fa-solid fa-info"></i>
          </div>
          <span>{{ toast.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-container {
  position: fixed; bottom: 16px; right: 16px; z-index: 200;
  display: flex; flex-direction: column-reverse; gap: 8px;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 300ms ease;
}
.toast-enter-from {
  opacity: 0; transform: translateX(40px);
}
.toast-leave-to {
  opacity: 0; transform: translateX(40px);
}
</style>
