<script setup lang="ts">
defineProps<{
  show: boolean;
  title?: string;
  maxWidth?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div
          class="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full mx-4 p-6"
          :style="{ maxWidth: maxWidth || '28rem' }"
        >
          <h3 v-if="title" class="text-lg font-semibold text-slate-100 mb-4">{{ title }}</h3>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
