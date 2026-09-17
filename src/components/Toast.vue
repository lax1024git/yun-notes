<script setup lang="ts">
import { computed } from 'vue'
import { useToastStore } from '../stores/toast'

const toast = useToastStore()
const items = computed(() => toast.items)
</script>

<template>
  <div class="toast-host">
    <div v-for="t in items" :key="t.id" class="toast" :class="t.type">
      <span>{{ t.message }}</span>
      <button class="close" @click="toast.dismiss(t.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: min(480px, 90vw);
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  box-shadow: var(--shadow);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  font-size: 0.9rem;
}
.toast.success {
  border-color: var(--success);
}
.toast.error {
  border-color: var(--danger);
}
.close {
  border: none;
  background: transparent;
  padding: 0 0.2rem;
  font-size: 1.1rem;
  color: var(--muted);
}
</style>
