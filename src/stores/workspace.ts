import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { api, errorMessage } from '../api/tauri'
import type { FileNode, WorkspaceTab } from '../types'
import { debounce } from '../utils/debounce'
import { appStore as store } from './persist'
import { useToastStore } from './toast'

function newId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function leafName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function samePath(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()
}

function normalizeTab(t: Partial<WorkspaceTab> & { path?: string }): WorkspaceTab {
  return {
    id: t.id || newId(),
    name: t.name || (t.path ? leafName(t.path) : '新标签页'),
    path: t.path ?? '',
    remoteUrl: t.remoteUrl ?? '',
    cryptoSalt: t.cryptoSalt || undefined,
    cryptoHash: t.cryptoHash || undefined,
  }
}

export function tabHasOwnCrypto(tab: WorkspaceTab | null | undefined): boolean {
  return !!(tab?.cryptoSalt && tab?.cryptoHash)
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const tabs = ref<WorkspaceTab[]>([])
  const activeId = ref<string | null>(null)

  const tree = ref<FileNode[]>([])
  const currentFile = ref<string | null>(null)
  const dirty = ref(false)
  const loading = ref(false)

  /** In-process plaintext passwords per tab (never persisted) */
  const tabCryptoPasswords = new Map<string, string>()
  /** Reactive unlock flags (Map alone is not reactive) */
  const unlockedTabIds = ref<Record<string, true>>({})
  /** Tab waiting for user to enter its encryption password */
  const pendingCryptoUnlockTabId = ref<string | null>(null)

  let unlistenFs: UnlistenFn | null = null
  let suppressWatchUntil = 0

  function suppressFsWatch(ms = 2000) {
    suppressWatchUntil = Date.now() + ms
  }

  const activeTab = computed(
    () => tabs.value.find((t) => t.id === activeId.value) ?? null,
  )

  const root = computed(() => {
    const p = activeTab.value?.path?.trim()
    return p ? p : null
  })
  const projectRoot = computed(() => root.value)
  const workRoot = computed(() => root.value)
  const vaultRoot = computed(() => root.value)

  const rootName = computed(() => {
    if (activeTab.value?.name) return activeTab.value.name
    if (!root.value) return ''
    return leafName(root.value)
  })

  const remoteUrl = computed({
    get: () => activeTab.value?.remoteUrl ?? '',
    set: (v: string) => {
      void updateActiveRemote(v)
    },
  })

  const pendingCryptoUnlockTab = computed(() => {
    const id = pendingCryptoUnlockTabId.value
    if (!id) return null
    return tabs.value.find((t) => t.id === id) ?? null
  })

  const activeTabCryptoReady = computed(() => {
    const tab = activeTab.value
    if (!tab?.path?.trim()) return true
    if (!tabHasOwnCrypto(tab)) return false
    return !!unlockedTabIds.value[tab.id]
  })

  async function persistTabs() {
    const payload = tabs.value.map((t) => ({
      id: t.id,
      name: t.name,
      path: t.path,
      remoteUrl: t.remoteUrl,
      ...(t.cryptoSalt ? { cryptoSalt: t.cryptoSalt } : {}),
      ...(t.cryptoHash ? { cryptoHash: t.cryptoHash } : {}),
    }))
    await store.set('workspaceTabs', payload)
    await store.set('activeWorkspaceId', activeId.value)
    if (root.value) await store.set('lastWorkspace', root.value)
    await store.save()
  }

  let tabsLoaded = false

  async function loadTabs(force = false) {
    if (tabsLoaded && !force) return

    const saved = (await store.get<WorkspaceTab[]>('workspaceTabs')) ?? []
    const savedActive = (await store.get<string | null>('activeWorkspaceId')) ?? null

    // Migrate only legacy *global crypto* fields onto tabs (never copy app-lock as crypto)
    const legacySeparate = (await store.get<boolean>('cryptoSeparate')) ?? false
    const legacySalt = (await store.get<string>('cryptoSalt')) ?? ''
    const legacyHash = (await store.get<string>('cryptoHash')) ?? ''

    let migrateSalt = ''
    let migrateHash = ''
    if (legacySeparate && legacySalt && legacyHash) {
      migrateSalt = legacySalt
      migrateHash = legacyHash
    }

    if (saved.length) {
      tabs.value = saved.map((t) => {
        const tab = normalizeTab(t)
        if (migrateSalt && migrateHash && !tabHasOwnCrypto(tab)) {
          tab.cryptoSalt = migrateSalt
          tab.cryptoHash = migrateHash
        }
        return tab
      })
      activeId.value =
        savedActive && tabs.value.some((t) => t.id === savedActive)
          ? savedActive
          : tabs.value[0]?.id ?? null
      if (migrateSalt) {
        await persistTabs()
        const { useSettingsStore } = await import('./settings')
        await useSettingsStore().clearLegacyGlobalCrypto()
      }
      tabsLoaded = true
      return
    }

    const last = (await store.get<string>('lastWorkspace')) ?? ''
    const legacyRemote = (await store.get<string>('remoteUrl')) ?? ''
    const recent = (await store.get<string[]>('recentWorkspaces')) ?? []
    const paths = [last, ...recent].filter(Boolean)
    const uniq: string[] = []
    for (const p of paths) {
      if (!uniq.includes(p)) uniq.push(p)
    }
    tabs.value = uniq.map((path, i) =>
      normalizeTab({
        path,
        name: leafName(path),
        remoteUrl: i === 0 ? legacyRemote : '',
        cryptoSalt: migrateSalt || undefined,
        cryptoHash: migrateHash || undefined,
      }),
    )
    activeId.value = tabs.value[0]?.id ?? null
    if (tabs.value.length) await persistTabs()
    if (migrateSalt) {
      const { useSettingsStore } = await import('./settings')
      await useSettingsStore().clearLegacyGlobalCrypto()
    }
    tabsLoaded = true
  }

  async function restoreLast() {
    await loadTabs(true)
    if (activeTab.value?.path?.trim()) {
      try {
        await loadRoot(activeTab.value.path)
      } catch {
        /* ignore missing path */
      }
    } else if (activeTab.value) {
      clearView()
    }
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
        void sealCopiedNotes()
      })
    } catch (e) {
      console.warn('work dir watch failed', e)
    }
  }

  function clearView() {
    tree.value = []
    currentFile.value = null
    dirty.value = false
    if (unlistenFs) {
      unlistenFs()
      unlistenFs = null
    }
  }

  function cacheTabPassword(tabId: string, password: string) {
    tabCryptoPasswords.set(tabId, password)
    unlockedTabIds.value = { ...unlockedTabIds.value, [tabId]: true }
  }

  function clearCachedTabPassword(tabId: string) {
    tabCryptoPasswords.delete(tabId)
    if (!unlockedTabIds.value[tabId]) return
    const next = { ...unlockedTabIds.value }
    delete next[tabId]
    unlockedTabIds.value = next
  }

  function dismissPendingCrypto() {
    pendingCryptoUnlockTabId.value = null
  }

  /**
   * Bind Rust crypto session to the active tab's password.
   * Returns false when the tab needs unlock or first-time password setup.
   */
  async function bindActiveCryptoSession(): Promise<boolean> {
    const tab = activeTab.value
    if (!tab?.path?.trim()) {
      pendingCryptoUnlockTabId.value = null
      return true
    }
    if (!tabHasOwnCrypto(tab)) {
      // Must set a per-tab password before encrypting notes
      pendingCryptoUnlockTabId.value = tab.id
      try {
        await api.lock.sessionClear()
      } catch {
        /* ignore */
      }
      return false
    }
    const cached = tabCryptoPasswords.get(tab.id)
    if (cached) {
      await api.lock.sessionSet(cached)
      pendingCryptoUnlockTabId.value = null
      return true
    }
    pendingCryptoUnlockTabId.value = tab.id
    try {
      await api.lock.sessionClear()
    } catch {
      /* ignore */
    }
    return false
  }

  async function unlockTabCrypto(tabId: string, password: string): Promise<boolean> {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab || !tabHasOwnCrypto(tab)) return false
    const ok = await api.lock.verify(password, tab.cryptoSalt!, tab.cryptoHash!)
    if (!ok) return false
    cacheTabPassword(tabId, password)
    await api.lock.sessionSet(password)
    if (pendingCryptoUnlockTabId.value === tabId) {
      pendingCryptoUnlockTabId.value = null
    }
    if (activeId.value === tabId && tab.path) {
      await loadRoot(tab.path, { skipCryptoBind: true })
    }
    return true
  }

  async function verifyTabCryptoPassword(tabId: string, password: string): Promise<boolean> {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return false
    if (tabHasOwnCrypto(tab)) {
      return api.lock.verify(password, tab.cryptoSalt!, tab.cryptoHash!)
    }
    // First-time setup on this tab: current password is whatever was used before (optional)
    return [...password].length >= 4
  }

  /**
   * Set or change this tab's encryption password and re-encrypt its workspace.
   */
  async function setTabCryptoPassword(tabId: string, current: string, next: string) {
    if ([...next].length < 4) throw new Error('加密密码至少 4 个字符')
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) throw new Error('工作区不存在')

    const firstTime = !tabHasOwnCrypto(tab)
    if (!firstTime) {
      const ok = await api.lock.verify(current, tab.cryptoSalt!, tab.cryptoHash!)
      if (!ok) throw new Error('当前加密密码不正确')
      await api.lock.sessionSet(current)
    } else if (current) {
      await api.lock.sessionSet(current)
    } else if (!(await api.lock.sessionReady())) {
      await api.lock.sessionSet(next)
    }

    if (tab.path.trim()) {
      if (!(await api.lock.sessionReady())) {
        await api.lock.sessionSet(next)
      } else {
        await api.sync.rekeyWorkspace(tab.path, next)
      }
    } else {
      await api.lock.sessionSet(next)
    }

    const made = await api.lock.hash(next)
    tab.cryptoSalt = made.salt
    tab.cryptoHash = made.hash
    cacheTabPassword(tabId, next)
    pendingCryptoUnlockTabId.value = null
    await persistTabs()

    if (activeId.value === tabId && tab.path.trim()) {
      await loadRoot(tab.path, { skipCryptoBind: true })
    }
  }

  /** Remove this tab's crypto config (must set again before reading encrypted notes). */
  async function clearTabOwnCrypto(tabId: string) {
    const tab = tabs.value.find((t) => t.id === tabId)
    if (!tab) return
    tab.cryptoSalt = undefined
    tab.cryptoHash = undefined
    clearCachedTabPassword(tabId)
    if (activeId.value === tabId && tab.path.trim()) {
      pendingCryptoUnlockTabId.value = tabId
      try {
        await api.lock.sessionClear()
      } catch {
        /* ignore */
      }
    } else if (pendingCryptoUnlockTabId.value === tabId) {
      pendingCryptoUnlockTabId.value = null
    }
    await persistTabs()
  }

  async function sealCopiedNotes() {
    if (!root.value) return
    if (tabHasOwnCrypto(activeTab.value) && !unlockedTabIds.value[activeTab.value!.id]) {
      return
    }
    if (!(await api.lock.sessionReady())) return
    try {
      const n = await api.fs.sealPlaintextNotes(root.value)
      if (n > 0) await refresh()
    } catch {
      /* ignore */
    }
  }

  async function loadRoot(
    path: string,
    opts?: { skipCryptoBind?: boolean },
  ) {
    if (!path.trim()) {
      clearView()
      pendingCryptoUnlockTabId.value = null
      return
    }
    const toast = useToastStore()
    loading.value = true
    try {
      if (!opts?.skipCryptoBind) {
        const bound = await bindActiveCryptoSession()
        if (!bound) {
          // Still show tree structure; decrypt ops blocked until unlock
          try {
            const paths = await api.project.init(path)
            tree.value = await api.fs.scanWorkspace(paths.root)
          } catch {
            clearView()
          }
          currentFile.value = null
          dirty.value = false
          return
        }
      }

      const paths = await api.project.init(path)
      const resolved = paths.root

      const tab = activeTab.value
      if (tab && tab.path !== resolved) {
        tab.path = resolved
        await persistTabs()
      }

      if (await api.lock.sessionReady()) {
        try {
          const n = await api.fs.sealPlaintextNotes(resolved)
          if (n > 0) toast.info(`已加密 ${n} 个明文笔记`)
        } catch (e) {
          toast.error(errorMessage(e))
        }
      }

      tree.value = await api.fs.scanWorkspace(resolved)
      currentFile.value = null
      dirty.value = false
      await startWatching(resolved)
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    } finally {
      loading.value = false
    }
  }

  /** Browser-like: instantly create an empty tab */
  async function createBlankTab(preferredName?: string): Promise<string> {
    const n = tabs.value.filter((t) => !t.path).length
    const tab = normalizeTab({
      name: preferredName || (n === 0 ? '新标签页' : `新标签页 ${n + 1}`),
      path: '',
      remoteUrl: '',
    })
    tabs.value.push(tab)
    activeId.value = tab.id
    clearView()
    pendingCryptoUnlockTabId.value = null
    await persistTabs()
    return tab.id
  }

  /** Bind a local git project folder to a tab (or create one) */
  async function bindTabPath(id: string, path: string, renameToLeaf = true) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    const existing = tabs.value.find((t) => t.id !== id && samePath(t.path, path))
    if (existing) {
      await removeTab(id)
      activeId.value = existing.id
      await persistTabs()
      await loadRoot(existing.path)
      return
    }
    tab.path = path
    if (renameToLeaf && (tab.name.startsWith('新标签页') || !tab.name.trim())) {
      tab.name = leafName(path)
    }
    activeId.value = id
    await persistTabs()
    await loadRoot(path)
  }

  /** Open path in its own tab (independent git project) */
  async function openWorkspace(path: string, name?: string) {
    const existing = tabs.value.find((t) => samePath(t.path, path))
    if (existing) {
      activeId.value = existing.id
      if (name && name !== existing.name) {
        existing.name = name
        await persistTabs()
      }
      await loadRoot(existing.path)
      return
    }
    if (activeTab.value && !activeTab.value.path.trim()) {
      if (name) activeTab.value.name = name
      await bindTabPath(activeTab.value.id, path, !name)
      return
    }
    const tab = normalizeTab({
      name: name || leafName(path),
      path,
      remoteUrl: '',
    })
    tabs.value.push(tab)
    activeId.value = tab.id
    await persistTabs()
    await loadRoot(path)
  }

  async function switchTab(id: string) {
    if (id === activeId.value) return
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    activeId.value = id
    await persistTabs()
    await loadRoot(tab.path)
  }

  async function renameTab(id: string, name: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    const n = name.trim()
    if (!n) return
    tab.name = n
    await persistTabs()
  }

  async function updateTabRemote(id: string, remoteUrlValue: string) {
    const tab = tabs.value.find((t) => t.id === id)
    if (!tab) return
    tab.remoteUrl = remoteUrlValue.trim()
    await persistTabs()
  }

  async function updateTabPath(id: string, path: string) {
    await bindTabPath(id, path, true)
  }

  async function updateActiveRemote(remoteUrlValue: string) {
    if (!activeId.value) return
    await updateTabRemote(activeId.value, remoteUrlValue)
  }

  async function removeTab(id: string) {
    const idx = tabs.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    const wasActive = activeId.value === id
    tabs.value.splice(idx, 1)
    clearCachedTabPassword(id)
    if (pendingCryptoUnlockTabId.value === id) {
      pendingCryptoUnlockTabId.value = null
    }
    if (!tabs.value.length) {
      activeId.value = null
      clearView()
      await persistTabs()
      return
    }
    if (wasActive) {
      const next = tabs.value[Math.max(0, idx - 1)]
      activeId.value = next.id
      await persistTabs()
      await loadRoot(next.path)
    } else {
      await persistTabs()
    }
  }

  async function refresh() {
    if (!root.value) return
    try {
      tree.value = await api.fs.scanWorkspace(root.value)
    } catch {
      /* ignore */
    }
  }

  function selectFile(path: string) {
    currentFile.value = path
    dirty.value = false
  }

  /** After app unlock, cache password for tabs whose crypto hash matches. */
  async function seedSharedCryptoFromUnlock(password: string) {
    for (const tab of tabs.value) {
      if (!tabHasOwnCrypto(tab)) continue
      try {
        const ok = await api.lock.verify(password, tab.cryptoSalt!, tab.cryptoHash!)
        if (ok) cacheTabPassword(tab.id, password)
      } catch {
        /* ignore */
      }
    }
    await bindActiveCryptoSession()
  }

  return {
    tabs,
    activeId,
    activeTab,
    root,
    projectRoot,
    workRoot,
    vaultRoot,
    tree,
    currentFile,
    dirty,
    loading,
    rootName,
    remoteUrl,
    pendingCryptoUnlockTabId,
    pendingCryptoUnlockTab,
    activeTabCryptoReady,
    createBlankTab,
    bindTabPath,
    openWorkspace,
    switchTab,
    renameTab,
    updateTabRemote,
    updateTabPath,
    updateActiveRemote,
    removeTab,
    refresh,
    selectFile,
    restoreLast,
    suppressFsWatch,
    loadTabs,
    bindActiveCryptoSession,
    dismissPendingCrypto,
    unlockTabCrypto,
    setTabCryptoPassword,
    clearTabOwnCrypto,
    verifyTabCryptoPassword,
    seedSharedCryptoFromUnlock,
    cacheTabPassword,
  }
})
