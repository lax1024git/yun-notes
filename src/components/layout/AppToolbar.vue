<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'

const editor = useEditorStore()
const workspace = useWorkspaceStore()

const title = computed(() => 'Note Workstation')
const pathLabel = computed(() => workspace.currentFile ?? '未打开文件')

async function save() {
  if (!workspace.currentFile) return
  await editor.save(workspace.currentFile)
}

defineExpose({ save })
</script>

<template>
  <header class="toolbar">
    <div class="brand">{{ title }}</div>
    <div class="path" :title="pathLabel">{{ pathLabel }}</div>
    <div class="actions">
      <select v-model="editor.mode" aria-label="编辑模式">
        <option value="edit">编辑</option>
        <option value="split">分栏</option>
        <option value="preview">预览</option>
      </select>
      <slot name="actions" />
      <button class="primary" :disabled="!workspace.currentFile" @click="save">保存</button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: grid;
  grid-template-columns: 180px 1fr auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  backdrop-filter: blur(8px);
}
.brand {
  font-weight: 700;
  letter-spacing: 0.01em;
}
.path {
  font-size: 0.85rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
select {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
}
</style>
