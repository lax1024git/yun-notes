<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import { debounce } from '../utils/debounce'
import { useEditorStore } from '../stores/editor'
import { useWorkspaceStore } from '../stores/workspace'
import 'highlight.js/styles/github-dark.css'

const editor = useEditorStore()
const workspace = useWorkspaceStore()
const html = ref('')

const renderDebounced = debounce((src: string) => {
  html.value = renderMarkdown(src)
}, 220)

function renderNow(src: string) {
  renderDebounced.cancel()
  html.value = renderMarkdown(src)
}

// Typing: debounced. File switch / load: immediate.
watch(
  () => editor.content,
  (src) => {
    if (editor.loading) return
    renderDebounced(src)
  },
)

watch(
  () => workspace.currentFile,
  () => {
    renderNow(editor.content)
  },
)

watch(
  () => editor.loading,
  (loading, was) => {
    if (was && !loading) renderNow(editor.content)
  },
  { immediate: true },
)

onUnmounted(() => renderDebounced.cancel())
</script>

<template>
  <div class="preview markdown-body" v-html="html" />
</template>

<style scoped>
.preview {
  height: 100%;
  overflow: auto;
  padding: 1rem 1.25rem;
  background: var(--preview-bg);
}
</style>
