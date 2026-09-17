<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { debounce } from '../utils/debounce'
import { useEditorStore } from '../stores/editor'
import { useWorkspaceStore } from '../stores/workspace'

const editor = useEditorStore()
const workspace = useWorkspaceStore()

const autoSave = debounce(() => {
  if (workspace.currentFile && workspace.dirty) {
    void editor.save(workspace.currentFile)
  }
}, 800)

function onInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  editor.content = value
  editor.markDirty()
  autoSave()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target as HTMLTextAreaElement
    const start = el.selectionStart
    const end = el.selectionEnd
    const v = editor.content
    editor.content = `${v.slice(0, start)}  ${v.slice(end)}`
    editor.markDirty()
    autoSave()
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2
    })
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (workspace.currentFile) void editor.save(workspace.currentFile)
  }
}

function onGlobalSave(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (workspace.currentFile) void editor.save(workspace.currentFile)
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalSave))
onUnmounted(() => window.removeEventListener('keydown', onGlobalSave))
</script>

<template>
  <textarea
    class="editor"
    :value="editor.content"
    :disabled="!workspace.currentFile || editor.loading"
    placeholder="选择或新建 Markdown 文件…"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeydown"
  />
</template>

<style scoped>
.editor {
  width: 100%;
  height: 100%;
  resize: none;
  border: none;
  border-radius: 0;
  padding: 1rem 1.1rem;
  background: var(--editor-bg);
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.6;
  outline: none;
}
</style>
