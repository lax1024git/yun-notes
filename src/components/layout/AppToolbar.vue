<script setup lang="ts">
import { computed } from 'vue'
import { useEditorStore } from '../../stores/editor'
import { useWorkspaceStore } from '../../stores/workspace'
import QuickToolbox from '../toolbox/QuickToolbox.vue'

const editor = useEditorStore()
const workspace = useWorkspaceStore()

const title = computed(() => 'LAX1024 TOOLS')
const pathLabel = computed(() => workspace.currentFile ?? 'NO FILE SELECTED')
const dirty = computed(() => workspace.dirty)

async function save() {
  if (!workspace.currentFile) return
  await editor.save(workspace.currentFile)
}

defineExpose({ save })
</script>

<template>
  <header class="toolbar">
    <div class="brand-block">
      <span class="brand-mark" aria-hidden="true" />
      <div class="brand-text">
        <div class="brand">{{ title }}</div>
        <div class="brand-sub">WORKBENCH</div>
      </div>
    </div>
    <div class="path" :title="pathLabel">
      <span class="path-prefix">PATH</span>
      <span class="path-value">{{ pathLabel }}</span>
      <span v-if="dirty" class="dirty" title="未保存">●</span>
    </div>
    <div class="actions">
      <QuickToolbox />
      <select v-model="editor.mode" aria-label="编辑模式" class="mode">
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
  grid-template-columns: minmax(160px, 200px) 1fr auto;
  gap: 0.85rem;
  align-items: center;
  padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 88%, transparent);
  backdrop-filter: blur(12px);
  position: relative;
}
.toolbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2), transparent 70%);
  opacity: 0.55;
}
.brand-block {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.brand-mark {
  width: 10px;
  height: 10px;
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
  flex-shrink: 0;
}
.brand {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.92rem;
  letter-spacing: 0.08em;
  line-height: 1.1;
}
.brand-sub {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  color: var(--muted);
  margin-top: 0.1rem;
}
.path {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg) 70%, var(--bg-elevated));
}
.path-prefix {
  color: var(--accent);
  letter-spacing: 0.08em;
  flex-shrink: 0;
  font-size: 0.68rem;
}
.path-value {
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.dirty {
  color: var(--warning);
  flex-shrink: 0;
  font-size: 0.65rem;
}
.actions {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.mode {
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: var(--radius);
  padding: 0.3rem 0.45rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
}
</style>
