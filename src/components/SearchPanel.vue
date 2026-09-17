<script setup lang="ts">
import { ref } from 'vue'
import { api, errorMessage } from '../api/tauri'
import type { SearchHit } from '../types'
import { useEditorStore } from '../stores/editor'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const editor = useEditorStore()
const toast = useToastStore()

const keyword = ref('')
const hits = ref<SearchHit[]>([])
const open = ref(false)

async function search() {
  if (!workspace.root || !keyword.value.trim()) return
  try {
    hits.value = await api.fs.searchFiles(workspace.root, keyword.value.trim())
    open.value = true
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function openHit(hit: SearchHit) {
  await editor.selectAndLoad(hit.path)
}
</script>

<template>
  <div class="search stack">
    <div class="row">
      <input
        v-model="keyword"
        placeholder="全文搜索…"
        :disabled="!workspace.root"
        @keydown.enter="search"
      />
      <button :disabled="!workspace.root" @click="search">搜索</button>
    </div>
    <ul v-if="open" class="hits">
      <li v-for="(hit, i) in hits" :key="hit.path + hit.line + i" @click="openHit(hit)">
        <div class="path">{{ hit.path }}:{{ hit.line }}</div>
        <div class="preview">{{ hit.preview }}</div>
      </li>
      <li v-if="!hits.length" class="muted">无结果</li>
    </ul>
  </div>
</template>

<style scoped>
.hits {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 180px;
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.hits li {
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
}
.hits li:hover {
  background: var(--accent-soft);
}
.path {
  font-size: 0.78rem;
  color: var(--accent);
}
.preview {
  font-size: 0.82rem;
  color: var(--muted);
}
</style>
