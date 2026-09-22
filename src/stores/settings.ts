import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { LazyStore } from '@tauri-apps/plugin-store'
import { api } from '../api/tauri'
import type { ThemeMode } from '../types'

const store = new LazyStore('settings.json')

export const useSettingsStore = defineStore('settings', () => {
  const giteeToken = ref('')
  /** 完整远程地址（可含 Token），Git / Gitee 共用 */
  const remoteUrl = ref('')
  const recentWorkspaces = ref<string[]>([])
  const theme = ref<ThemeMode>('system')
  const ready = ref(false)

  /** 启动密码锁（仅 UI 解锁，可与加密密码不同） */
  const lockEnabled = ref(false)
  const lockSalt = ref('')
  const lockHash = ref('')
  /** 本次进程是否已通过启动锁 */
  const unlocked = ref(false)

  /**
   * 笔记加密密码是否已独立设置。
   * false：加密密码 = 启动锁密码（兼容旧数据）
   */
  const cryptoSeparate = ref(false)
  const cryptoSalt = ref('')
  const cryptoHash = ref('')

  const needsUnlock = computed(
    () => ready.value && lockEnabled.value && !!lockSalt.value && !!lockHash.value && !unlocked.value,
  )

  const cryptoConfigured = computed(
    () => cryptoSeparate.value && !!cryptoSalt.value && !!cryptoHash.value,
  )

  async function load() {
    giteeToken.value = (await store.get<string>('giteeToken')) ?? ''
    remoteUrl.value = (await store.get<string>('remoteUrl')) ?? ''
    recentWorkspaces.value = (await store.get<string[]>('recentWorkspaces')) ?? []
    theme.value = ((await store.get<ThemeMode>('theme')) ?? 'system') as ThemeMode
    lockEnabled.value = (await store.get<boolean>('lockEnabled')) ?? false
    lockSalt.value = (await store.get<string>('lockSalt')) ?? ''
    lockHash.value = (await store.get<string>('lockHash')) ?? ''
    cryptoSeparate.value = (await store.get<boolean>('cryptoSeparate')) ?? false
    cryptoSalt.value = (await store.get<string>('cryptoSalt')) ?? ''
    cryptoHash.value = (await store.get<string>('cryptoHash')) ?? ''
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

  async function persistCrypto() {
    await store.set('cryptoSeparate', cryptoSeparate.value)
    await store.set('cryptoSalt', cryptoSalt.value)
    await store.set('cryptoHash', cryptoHash.value)
    await store.save()
  }

  async function seedCryptoSession(password: string) {
    await api.lock.sessionSet(password)
  }

  async function enableLock(password: string) {
    const made = await api.lock.hash(password)
    lockSalt.value = made.salt
    lockHash.value = made.hash
    lockEnabled.value = true
    unlocked.value = true
    // 未独立设置加密密码时：启动密码兼作加密密码
    if (!cryptoConfigured.value) {
      await seedCryptoSession(password)
    }
    await persistLock()
  }

  /**
   * 修改启动密码。
   * - 独立加密：只改启动锁，不碰笔记
   * - 共用模式：改启动密码即改加密密码（有工作区则重加密）
   */
  async function changeLockPassword(
    current: string,
    next: string,
    workspaceRoot?: string | null,
  ) {
    const ok = await api.lock.verify(current, lockSalt.value, lockHash.value)
    if (!ok) throw new Error('当前启动密码不正确')

    if (!cryptoConfigured.value) {
      if (workspaceRoot) {
        await api.sync.rekeyWorkspace(workspaceRoot, next)
      } else {
        await seedCryptoSession(next)
      }
    }

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
    if (!cryptoConfigured.value) {
      await api.lock.sessionClear()
    }
  }

  /**
   * 解锁启动锁，并尽量建立加密会话。
   * 独立加密且未传 cryptoPassword 时：UI 解锁成功，但需再调 unlockCrypto。
   */
  async function unlock(password: string, cryptoPassword?: string): Promise<boolean> {
    if (!lockEnabled.value || !lockSalt.value || !lockHash.value) {
      unlocked.value = true
      return true
    }
    const ok = await api.lock.verify(password, lockSalt.value, lockHash.value)
    if (!ok) return false

    if (cryptoConfigured.value) {
      if (cryptoPassword) {
        const cok = await api.lock.verify(cryptoPassword, cryptoSalt.value, cryptoHash.value)
        if (!cok) return false
        await seedCryptoSession(cryptoPassword)
      }
      // 未提供加密密码：仅通过启动锁，加密会话稍后 unlockCrypto
    } else {
      await seedCryptoSession(password)
    }
    unlocked.value = true
    return true
  }

  async function unlockCrypto(cryptoPassword: string): Promise<boolean> {
    if (cryptoConfigured.value) {
      const ok = await api.lock.verify(cryptoPassword, cryptoSalt.value, cryptoHash.value)
      if (!ok) return false
    } else if ([...cryptoPassword].length < 4) {
      return false
    }
    await seedCryptoSession(cryptoPassword)
    return true
  }

  async function verifyCurrentCryptoPassword(password: string): Promise<boolean> {
    if (cryptoConfigured.value) {
      return api.lock.verify(password, cryptoSalt.value, cryptoHash.value)
    }
    if (lockEnabled.value && lockSalt.value && lockHash.value) {
      return api.lock.verify(password, lockSalt.value, lockHash.value)
    }
    return [...password].length >= 4
  }

  /**
   * 设置或修改独立笔记加密密码（与启动密码分离）。
   * 有工作区时重加密全部笔记。
   */
  async function setCryptoPassword(
    current: string,
    next: string,
    workspaceRoot?: string | null,
  ) {
    if ([...next].length < 4) throw new Error('加密密码至少 4 个字符')

    const ok = await verifyCurrentCryptoPassword(current)
    if (!ok) throw new Error('当前加密密码不正确')

    if (workspaceRoot) {
      await api.sync.rekeyWorkspace(workspaceRoot, next)
    } else {
      await seedCryptoSession(next)
    }

    const made = await api.lock.hash(next)
    cryptoSalt.value = made.salt
    cryptoHash.value = made.hash
    cryptoSeparate.value = true
    await persistCrypto()
  }

  /** 取消独立加密，改回与启动密码共用 */
  async function bindCryptoToUnlock(
    unlockPassword: string,
    workspaceRoot?: string | null,
  ) {
    if (!lockEnabled.value || !lockSalt.value || !lockHash.value) {
      throw new Error('请先启用启动密码锁')
    }
    const ok = await api.lock.verify(unlockPassword, lockSalt.value, lockHash.value)
    if (!ok) throw new Error('启动密码不正确')

    if (workspaceRoot) {
      await api.sync.rekeyWorkspace(workspaceRoot, unlockPassword)
    } else {
      await seedCryptoSession(unlockPassword)
    }

    cryptoSeparate.value = false
    cryptoSalt.value = ''
    cryptoHash.value = ''
    await persistCrypto()
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
    cryptoSeparate,
    cryptoSalt,
    cryptoHash,
    cryptoConfigured,
    load,
    saveToken,
    saveRemoteUrl,
    setTheme,
    applyTheme,
    enableLock,
    changeLockPassword,
    disableLock,
    unlock,
    unlockCrypto,
    setCryptoPassword,
    bindCryptoToUnlock,
  }
})
