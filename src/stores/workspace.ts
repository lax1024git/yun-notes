import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { LazyStore } from '@tauri-apps/plugin-store'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { api, errorMessage } from '../api/tauri'
import type { FileNode } from '../types'
import { debounce } from '../utils/debounce'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'

const store = new LazyStore('settings.json')

export const useWorkspaceStore = defineStore('workspace', () => {
  /** Single workspace root: notes encrypted on disk, git repo here */
  const root = ref<string | null>(null)
  const tree = ref<FileNode[]>([])
  const currentFile = ref<string | null>(null)
  const dirty = ref(false)
  const loading = ref(false)

  let unlistenFs: UnlistenFn | null = null
  /** Ignore self-triggered saves so typing doesn't rescan the whole tree */
  let suppressWatchUntil = 0

  function suppressFsWatch(ms = 2000) {
    suppressWatchUntil = Date.now() + ms
  }

  /** Compat aliases for older UI that referenced work/vault */
  const projectRoot = computed(() => root.value)
  const workRoot = computed(() => root.value)
  const vaultRoot = computed(() => root.value)

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

  const refreshDebounced = debounce(() => {
    void refresh()
  }, 400)

  async function startWatching(path: string) {
    try {
      if (unlistenFs) {
        unlistenFs()
        unlistenFs = null
      }
      await api.watch.workDir(path)
      unlistenFs = await listen('work-fs-changed', () => {
        if (Date.now() < suppressWatchUntil) return
        refreshDebounced()
        // Seal newly copied plaintext notes in the background
        void sealCopiedNotes()
      })
    } catch (e) {
      console.warn('work dir watch failed', e)
    }
  }

  async function sealCopiedNotes() {
    if (!root.value) return
    const settings = useSettingsStore()
    if (!settings.lockEnabled || !(await api.lock.sessionReady())) return
    try {
      const n = await api.fs.sealPlaintextNotes(root.value)
      if (n > 0) await refresh()
    } catch {
      /* ignore */
    }
  }

  async function openWorkspace(path: string) {
    const toast = useToastStore()
    const settings = useSettingsStore()
    loading.value = true
    try {
      const paths = await api.project.init(path)
      root.value = paths.root

      if (settings.lockEnabled && (await api.lock.sessionReady())) {
        try {
          const n = await api.fs.sealPlaintextNotes(paths.root)
          if (n > 0) toast.info(`已加密 ${n} 个明文笔记`)
        } catch (e) {
          toast.error(errorMessage(e))
        }
      }

      tree.value = await api.fs.scanWorkspace(paths.root)
      currentFile.value = null
      dirty.value = false
      await persistRecent(paths.root)
      await startWatching(paths.root)
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    if (!root.value) return
    try {
      tree.value = await api.fs.scanWorkspace(root.value)
    } catch {
      /* ignore transient scan errors during copy */
    }
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
    projectRoot,
    workRoot,
    vaultRoot,
    tree,
    currentFile,
    dirty,
    loading,
    rootName,
    openWorkspace,
    refresh,
    selectFile,
    restoreLast,
    suppressFsWatch,
  }
})
