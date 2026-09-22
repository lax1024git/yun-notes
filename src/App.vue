<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import AppToolbar from './components/layout/AppToolbar.vue'
import AppSidebar from './components/layout/AppSidebar.vue'
import MarkdownEditor from './components/MarkdownEditor.vue'
import MarkdownPreview from './components/MarkdownPreview.vue'
import SearchPanel from './components/SearchPanel.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import UnlockGate from './components/UnlockGate.vue'
import Toast from './components/Toast.vue'
import { api, errorMessage } from './api/tauri'
import { useEditorStore } from './stores/editor'
import { useSettingsStore } from './stores/settings'
import { useToastStore } from './stores/toast'
import { useWorkspaceStore } from './stores/workspace'

const workspace = useWorkspaceStore()
const editor = useEditorStore()
const settings = useSettingsStore()
const toast = useToastStore()
const settingsOpen = ref(false)
const bootstrapped = ref(false)
const exporting = ref(false)

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
  await win.onCloseRequested(async () => {
    // 尽最大努力保存，但不拦截关闭（避免关不掉）
    if (workspace.currentFile && workspace.dirty) {
      try {
        await Promise.race([
          editor.save(workspace.currentFile),
          new Promise<void>((resolve) => setTimeout(resolve, 1500)),
        ])
      } catch {
        /* ignore */
      }
    }
  })
})

async function onUnlocked() {
  await enterApp()
}

async function exportDecrypted() {
  if (!workspace.root) {
    toast.error('请先打开工作区')
    return
  }
  if (!settings.lockEnabled || !(await api.lock.sessionReady())) {
    toast.error('请先启用并解锁应用锁后再导出')
    return
  }
  const dest = await pickDirectory({
    directory: true,
    multiple: false,
    title: '选择解密导出目录',
  })
  if (typeof dest !== 'string') return
  exporting.value = true
  try {
    const n = await api.fs.exportDecrypted(workspace.root, dest)
    toast.success(`已导出 ${n} 个文件到：${dest}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <UnlockGate v-if="settings.needsUnlock" @unlocked="onUnlocked" />
  <div v-else class="app-shell">
    <AppToolbar>
      <template #actions>
        <button
          type="button"
          :disabled="!workspace.root || exporting"
          @click="exportDecrypted"
        >
          {{ exporting ? '导出中…' : '导出明文' }}
        </button>
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
