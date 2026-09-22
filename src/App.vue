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
  if (!(await api.lock.sessionReady())) {
    toast.error('请先解锁笔记加密密码后再导出')
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
  padding: 0.65rem 0.85rem 0;
}
.editors {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  margin: 0.65rem 0.85rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.editors::before,
.editors::after {
  content: '';
  position: absolute;
  width: 12px;
  height: 12px;
  z-index: 2;
  pointer-events: none;
  border-color: var(--accent);
  border-style: solid;
  opacity: 0.7;
}
.editors::before {
  top: 0;
  left: 0;
  border-width: 2px 0 0 2px;
}
.editors::after {
  right: 0;
  bottom: 0;
  border-width: 0 2px 2px 0;
}
.editors.split {
  grid-template-columns: 1fr 1fr;
}
.editors.edit,
.editors.preview {
  grid-template-columns: 1fr;
}
.editors.split > :first-child {
  border-right: 1px solid var(--border);
}
</style>
