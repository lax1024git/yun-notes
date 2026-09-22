import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, errorMessage } from '../api/tauri'
import type { EditorMode } from '../types'
import { useToastStore } from './toast'
import { useWorkspaceStore } from './workspace'

export const useEditorStore = defineStore('editor', () => {
  const content = ref('')
  const mode = ref<EditorMode>('split')
  const loading = ref(false)
  const savedAt = ref<number | null>(null)

  async function load(path: string) {
    const toast = useToastStore()
    loading.value = true
    try {
      content.value = await api.fs.readMd(path)
      savedAt.value = Date.now()
      const ws = useWorkspaceStore()
      ws.dirty = false
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    } finally {
      loading.value = false
    }
  }

  async function save(path: string) {
    const toast = useToastStore()
    const ws = useWorkspaceStore()
    ws.suppressFsWatch(2500)
    try {
      await api.fs.writeMd(path, content.value)
      savedAt.value = Date.now()
      ws.dirty = false
    } catch (e) {
      toast.error(`保存失败: ${errorMessage(e)}`)
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        await sendNotification({ title: 'Note Workstation', body: '自动保存失败' })
      } catch {
        /* ignore */
      }
      throw e
    }
  }

  async function selectAndLoad(path: string) {
    const lower = path.replace(/\\/g, '/').toLowerCase()
    const ok =
      lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.txt')
    if (!ok) {
      useToastStore().info('该文件类型不可在编辑器中打开')
      return
    }
    const ws = useWorkspaceStore()
    if (ws.currentFile && ws.dirty) {
      await save(ws.currentFile)
    }
    ws.selectFile(path)
    await load(path)
  }

  function markDirty() {
    useWorkspaceStore().dirty = true
  }

  return {
    content,
    mode,
    loading,
    savedAt,
    load,
    save,
    selectAndLoad,
    markDirty,
  }
})
