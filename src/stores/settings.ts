import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { api } from '../api/tauri'
import type { ThemeMode } from '../types'
import { appStore as store } from './persist'

export const useSettingsStore = defineStore('settings', () => {
  const giteeToken = ref('')
  /** 完整远程地址（可含 Token），Git / Gitee 共用 */
  const remoteUrl = ref('')
  const recentWorkspaces = ref<string[]>([])
  const theme = ref<ThemeMode>('system')
  const ready = ref(false)

  /** 启动密码锁（仅 UI 解锁，不参与笔记加解密） */
  const lockEnabled = ref(false)
  const lockSalt = ref('')
  const lockHash = ref('')
  /** 本次进程是否已通过启动锁 */
  const unlocked = ref(false)

  const needsUnlock = computed(
    () => ready.value && lockEnabled.value && !!lockSalt.value && !!lockHash.value && !unlocked.value,
  )

  async function load() {
    giteeToken.value = (await store.get<string>('giteeToken')) ?? ''
    remoteUrl.value = (await store.get<string>('remoteUrl')) ?? ''
    recentWorkspaces.value = (await store.get<string[]>('recentWorkspaces')) ?? []
    theme.value = ((await store.get<ThemeMode>('theme')) ?? 'system') as ThemeMode
    lockEnabled.value = (await store.get<boolean>('lockEnabled')) ?? false
    lockSalt.value = (await store.get<string>('lockSalt')) ?? ''
    lockHash.value = (await store.get<string>('lockHash')) ?? ''
    unlocked.value = !(lockEnabled.value && lockSalt.value && lockHash.value)
    applyTheme(theme.value)
    ready.value = true
  }

  async function persistLock() {
    await store.set('lockEnabled', lockEnabled.value)
    await store.set('lockSalt', lockSalt.value)
    await store.set('lockHash', lockHash.value)
    await store.save()
  }

  /** Clear legacy global crypto fields (encryption is per-tab only). */
  async function clearLegacyGlobalCrypto() {
    try {
      await store.delete('cryptoSeparate')
      await store.delete('cryptoSalt')
      await store.delete('cryptoHash')
      await store.save()
    } catch {
      /* ignore */
    }
  }

  async function enableLock(password: string) {
    const made = await api.lock.hash(password)
    lockSalt.value = made.salt
    lockHash.value = made.hash
    lockEnabled.value = true
    unlocked.value = true
    await persistLock()
  }

  async function changeLockPassword(current: string, next: string) {
    const ok = await api.lock.verify(current, lockSalt.value, lockHash.value)
    if (!ok) throw new Error('当前启动密码不正确')

    const made = await api.lock.hash(next)
    lockSalt.value = made.salt
    lockHash.value = made.hash
    lockEnabled.value = true
    unlocked.value = true
    await persistLock()
  }

  async function disableLock(current: string) {
    const ok = await api.lock.verify(current, lockSalt.value, lockHash.value)
    if (!ok) throw new Error('当前启动密码不正确')
    lockEnabled.value = false
    lockSalt.value = ''
    lockHash.value = ''
    unlocked.value = true
    await persistLock()
  }

  /** Unlock app UI only — does not set file-encryption session. */
  async function unlock(password: string): Promise<boolean> {
    if (!lockEnabled.value || !lockSalt.value || !lockHash.value) {
      unlocked.value = true
      return true
    }
    const ok = await api.lock.verify(password, lockSalt.value, lockHash.value)
    if (!ok) return false
    unlocked.value = true
    return true
  }

  async function saveRemoteUrl(url: string) {
    remoteUrl.value = url
    try {
      await store.set('remoteUrl', url)
      await store.save()
    } catch {
      /* ignore */
    }
  }

  async function saveToken(token: string) {
    giteeToken.value = token
    try {
      await store.set('giteeToken', token)
      await store.save()
    } catch {
      /* ignore */
    }
  }

  async function setTheme(mode: ThemeMode) {
    theme.value = mode
    applyTheme(mode)
    try {
      await store.set('theme', mode)
      await store.save()
    } catch {
      /* ignore */
    }
  }

  function applyTheme(mode: ThemeMode) {
    const root = document.documentElement
    let dark = false
    if (mode === 'dark') dark = true
    else if (mode === 'light') dark = false
    else dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.dataset.theme = dark ? 'dark' : 'light'
  }

  watch(theme, (m) => applyTheme(m))

  return {
    giteeToken,
    remoteUrl,
    recentWorkspaces,
    theme,
    ready,
    lockEnabled,
    lockSalt,
    lockHash,
    unlocked,
    needsUnlock,
    load,
    saveToken,
    saveRemoteUrl,
    setTheme,
    applyTheme,
    enableLock,
    changeLockPassword,
    disableLock,
    unlock,
    clearLegacyGlobalCrypto,
  }
})
