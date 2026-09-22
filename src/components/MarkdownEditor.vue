<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { debounce } from '../utils/debounce'
import { useEditorStore } from '../stores/editor'
import { useWorkspaceStore } from '../stores/workspace'

const editor = useEditorStore()
const workspace = useWorkspaceStore()

/** Local draft avoids pinia→textarea rebind fighting the caret */
const draft = ref('')

watch(
  () => editor.loading,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      draft.value = editor.content
    }
    if (loading) {
      draft.value = ''
    }
  },
)

watch(
  () => workspace.currentFile,
  (path) => {
    if (!path) draft.value = ''
    else if (!editor.loading) draft.value = editor.content
  },
)

const autoSave = debounce(() => {
  if (workspace.currentFile && workspace.dirty) {
    void editor.save(workspace.currentFile)
  }
}, 1500)

function pushToStore(value: string) {
  editor.content = value
  editor.markDirty()
  autoSave()
}

function onInput(e: Event) {
  const value = (e.target as HTMLTextAreaElement).value
  draft.value = value
  pushToStore(value)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = e.target as HTMLTextAreaElement
    const start = el.selectionStart
    const end = el.selectionEnd
    const v = draft.value
    const next = `${v.slice(0, start)}  ${v.slice(end)}`
    draft.value = next
    pushToStore(next)
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + 2
    })
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    autoSave.flush()
    if (workspace.currentFile) void editor.save(workspace.currentFile)
  }
}

function onBlur() {
  autoSave.flush()
}

function onGlobalSave(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    autoSave.flush()
    if (workspace.currentFile) void editor.save(workspace.currentFile)
  }
}

onMounted(() => {
  draft.value = editor.content
  window.addEventListener('keydown', onGlobalSave)
})
onUnmounted(() => {
  autoSave.flush()
  autoSave.cancel()
  window.removeEventListener('keydown', onGlobalSave)
})
</script>

<template>
  <textarea
    class="editor"
    :value="draft"
    :disabled="!workspace.currentFile || editor.loading"
    placeholder="选择或新建 Markdown 文件…"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeydown"
    @blur="onBlur"
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
