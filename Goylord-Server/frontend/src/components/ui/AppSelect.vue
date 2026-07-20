<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'

interface Option {
  value: string | number
  label: string
  disabled?: boolean
}

const props = defineProps<{
  modelValue: string | number | null | undefined
  options: Option[]
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  size?: 'sm' | 'md'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

const isOpen = ref(false)
const search = ref('')
const rootEl = ref<HTMLDivElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const highlightIdx = ref(-1)

const filteredOptions = computed(() => {
  if (!search.value) return props.options
  const q = search.value.toLowerCase()
  return props.options.filter(o => o.label.toLowerCase().includes(q))
})

const selectedLabel = computed(() => {
  const opt = props.options.find(o => o.value === props.modelValue)
  return opt?.label || props.placeholder || 'Select...'
})

function toggle() {
  if (props.disabled) return
  isOpen.value = !isOpen.value
  if (isOpen.value && props.searchable) {
    search.value = ''
    nextTick(() => searchInput.value?.focus())
  }
  highlightIdx.value = -1
}

function select(opt: Option) {
  if (opt.disabled) return
  emit('update:modelValue', opt.value)
  isOpen.value = false
  search.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (!isOpen.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault(); toggle()
    }
    return
  }
  if (e.key === 'Escape') { isOpen.value = false; return }
  if (e.key === 'ArrowDown') { e.preventDefault(); highlightIdx.value = Math.min(highlightIdx.value + 1, filteredOptions.value.length - 1); scrollToHighlight() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); highlightIdx.value = Math.max(highlightIdx.value - 1, 0); scrollToHighlight() }
  else if (e.key === 'Enter') {
    e.preventDefault()
    if (highlightIdx.value >= 0 && filteredOptions.value[highlightIdx.value]) {
      select(filteredOptions.value[highlightIdx.value])
    }
  }
}

function scrollToHighlight() {
  nextTick(() => {
    const el = rootEl.value?.querySelector('.app-select-highlight')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function onClickOutside(e: MouseEvent) {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    isOpen.value = false; search.value = ''
  }
}

onMounted(() => document.addEventListener('mousedown', onClickOutside))
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))
</script>

<template>
  <div ref="rootEl" class="app-select" :class="{ open: isOpen, disabled, 'select-sm': size === 'sm' }" @keydown="onKeydown" :tabindex="disabled ? -1 : 0" @focus="() => {}">
    <div class="app-select-trigger" @click="toggle">
      <span class="app-select-label" :class="{ placeholder: !modelValue && modelValue !== 0 }">{{ selectedLabel }}</span>
      <i class="fa-solid fa-chevron-down app-select-arrow" :class="{ 'arrow-open': isOpen }"></i>
    </div>
    <Transition name="dropdown">
      <div v-if="isOpen" class="app-select-dropdown">
        <div v-if="searchable" class="app-select-search">
          <input ref="searchInput" v-model="search" placeholder="Search..." class="app-select-search-input" @click.stop />
        </div>
        <div class="app-select-options">
          <div v-if="filteredOptions.length === 0" class="app-select-empty">No options</div>
          <div v-for="(opt, idx) in filteredOptions" :key="opt.value" class="app-select-option" :class="{ selected: opt.value === modelValue, disabled: opt.disabled, 'app-select-highlight': idx === highlightIdx }" @click="select(opt)">
            <span>{{ opt.label }}</span>
            <i v-if="opt.value === modelValue" class="fa-solid fa-check" style="font-size:10px;color:#818cf8"></i>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app-select { position: relative; width: 100%; font-size: 0.875rem; }
.app-select:focus-within .app-select-trigger { border-color: rgba(100, 116, 139, 0.82); }
.app-select.disabled { opacity: 0.5; pointer-events: none; }

.app-select-trigger {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 14px; border-radius: 10px;
  background: rgba(8, 12, 24, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.2);
  color: #e8edf2; cursor: pointer;
  transition: border-color 200ms ease;
  min-height: 38px;
}
.app-select-trigger:hover { border-color: rgba(100, 116, 139, 0.82); }

.select-sm .app-select-trigger { padding: 6px 10px; font-size: 0.8125rem; min-height: 32px; border-radius: 8px; }

.app-select-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.app-select-label.placeholder { color: #6b7a98; }

.app-select-arrow { font-size: 10px; color: #64748b; transition: transform 200ms ease; flex-shrink: 0; }
.arrow-open { transform: rotate(180deg); }

.app-select-dropdown {
  position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 100;
  background: rgba(10, 15, 30, 0.97);
  border: 1px solid rgba(100, 116, 139, 0.35);
  border-radius: 10px;
  box-shadow: 0 14px 34px rgba(2, 6, 23, 0.7);
  backdrop-filter: blur(12px);
  max-height: 260px;
  overflow: hidden;
  display: flex; flex-direction: column;
}

.app-select-search { padding: 6px; border-bottom: 1px solid rgba(51, 65, 85, 0.5); }
.app-select-search-input {
  width: 100%; padding: 6px 10px; border-radius: 6px;
  background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(51, 65, 85, 0.5);
  color: #e2e8f0; font-size: 12px; outline: none;
}
.app-select-search-input:focus { border-color: rgba(99, 102, 241, 0.5); }
.app-select-search-input::placeholder { color: #475569; }

.app-select-options { overflow-y: auto; padding: 4px; }
.app-select-option {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 7px 10px; border-radius: 6px;
  color: #94a3b8; cursor: pointer;
  transition: all 100ms ease;
}
.app-select-option:hover, .app-select-highlight { background: rgba(99, 102, 241, 0.12); color: #e2e8f0; }
.app-select-option.selected { color: #818cf8; background: rgba(99, 102, 241, 0.08); }
.app-select-option.disabled { opacity: 0.4; pointer-events: none; }

.app-select-empty { padding: 12px; text-align: center; color: #475569; font-size: 12px; }

.dropdown-enter-active { transition: opacity 120ms ease, transform 120ms ease; }
.dropdown-leave-active { transition: opacity 80ms ease, transform 80ms ease; }
.dropdown-enter-from { opacity: 0; transform: translateY(-6px); }
.dropdown-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
