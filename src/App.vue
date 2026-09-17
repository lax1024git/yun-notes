<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import AppToolbar from './components/layout/AppToolbar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import SearchPanel from './components/SearchPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import UnlockGate from './components/UnlockGate.vue'
import Toast from './components/Toast.vue'
import { useEditorStore } from './stores/editor'
import { useSettingsStore } from './stores/settings'
import { useWorkspaceStore } from './stores/workspace'

const workspace = useWorkspaceStore()
const editor = useEditorStore()
const settings = useSettingsStore()
const settingsOpen = ref(false)
const bootstrapped = ref(false)

const showEditor = computed(
  () => editor.mode === 'edit' || editor.mode === 'split',
)
const showPreview = computed(
  () => editor.mode === 'preview' || editor.mode === 'split',
)

async function enterApp() {
  if (bootstrapped.value) return
  bootstrapped.value = true
  await workspace.restoreLast()
}

onMounted(async () => {
  await settings.load()
  if (!settings.needsUnlock) {
    await enterApp()
  }

  const win = getCurrentWindow()
  await win.onCloseRequested(async (event) => {
    if (workspace.currentFile && workspace.dirty) {
      try {
        await editor.save(workspace.currentFile)
      } catch {
        event.preventDefault()
      }
    }
  })
})

async function onUnlocked() {
  await enterApp()
}
</script>

<template>
  <UnlockGate v-if="settings.needsUnlock" @unlocked="onUnlocked" />
  <div v-else class="app-shell">
    <AppToolbar>
      <template #actions>
        <button @click="settingsOpen = true">设置</button>
      </template>
    </AppToolbar>
    <div class="app-body">
      <AppSidebar />
      <main class="main-pane">
        <div class="search-bar">
          <SearchPanel />
        </div>
        <div class="editors" :class="editor.mode">
          <MarkdownEditor v-if="showEditor" />
          <MarkdownPreview v-if="showPreview" />
        </div>
      </main>
    </div>
    <Toast />
    <SettingsDialog v-model:open="settingsOpen" />
  </div>
  <Toast v-if="settings.needsUnlock" />
</template>

<style scoped>
.search-bar {
  padding: 0.55rem 0.75rem 0;
}
.editors {
  flex: 1;
  min-height: 0;
  display: grid;
  margin: 0.55rem 0.75rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.editors.split {
  grid-template-columns: 1fr 1fr;
}
.editors.edit,
.editors.preview {
  grid-template-columns: 1fr;
}
</style>
