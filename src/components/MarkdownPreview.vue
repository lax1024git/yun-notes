<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import { useEditorStore } from '../stores/editor'
import 'highlight.js/styles/github-dark.css'

const editor = useEditorStore()
const html = computed(() => renderMarkdown(editor.content))
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
