import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LazyStore } from '@tauri-apps/plugin-store'
import { api, errorMessage } from '../api/tauri'
import type { FileNode } from '../types'
import { useToastStore } from './toast'

const store = new LazyStore('settings.json')

export const useWorkspaceStore = defineStore('workspace', () => {
  const root = ref<string | null>(null)
  const tree = ref<FileNode[]>([])
  const currentFile = ref<string | null>(null)
  const dirty = ref(false)
  const loading = ref(false)

  const rootName = computed(() => {
    if (!root.value) return ''
    const parts = root.value.replace(/\\/g, '/').split('/')
    return parts[parts.length - 1] || root.value
  })

  async function persistRecent(path: string) {
    await store.set('lastWorkspace', path)
    const recent = ((await store.get<string[]>('recentWorkspaces')) ?? []).filter(
      (p) => p !== path,
    )
    recent.unshift(path)
    await store.set('recentWorkspaces', recent.slice(0, 10))
    await store.save()
  }

  async function openWorkspace(path: string) {
    const toast = useToastStore()
    loading.value = true
    try {
      tree.value = await api.fs.scanWorkspace(path)
      root.value = path
      currentFile.value = null
      dirty.value = false
      await persistRecent(path)
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    if (!root.value) return
    tree.value = await api.fs.scanWorkspace(root.value)
  }

  function selectFile(path: string) {
    currentFile.value = path
    dirty.value = false
  }

  async function restoreLast() {
    const last = await store.get<string>('lastWorkspace')
    if (last) {
      try {
        await openWorkspace(last)
      } catch {
        /* ignore missing path */
      }
    }
  }

  return {
    root,
    tree,
    currentFile,
    dirty,
    loading,
    rootName,
    openWorkspace,
    refresh,
    selectFile,
    restoreLast,
  }
})
