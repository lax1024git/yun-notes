import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, errorMessage, isAppError } from '../api/tauri'
import type { CommitInfo, GitStatus } from '../types'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'
import { useWorkspaceStore } from './workspace'

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatus | null>(null)
  const log = ref<CommitInfo[]>([])
  const loading = ref(false)
  const notRepo = ref(false)

  function requireRoot(): string {
    const workspace = useWorkspaceStore()
    if (!workspace.root) throw new Error('请先打开项目')
    return workspace.root
  }

  async function ensureCryptoSession(): Promise<boolean> {
    const toast = useToastStore()
    const workspace = useWorkspaceStore()
    if (!workspace.activeTabCryptoReady) {
      toast.error('请先解锁当前工作区的笔记加密密码')
      return false
    }
    const ready = await api.lock.sessionReady()
    if (!ready) {
      toast.error('请先在工作区设置中配置并解锁笔记加密密码')
      return false
    }
    return true
  }

  async function refresh(rootPath?: string) {
    const toast = useToastStore()
    const root = rootPath ?? useWorkspaceStore().root
    if (!root) return
    loading.value = true
    try {
      status.value = await api.git.status(root)
      notRepo.value = false
      log.value = await api.git.log(root, 20)
    } catch (e) {
      const code =
        typeof e === 'object' && e && 'code' in e
          ? String((e as { code: string }).code)
          : ''
      const msg = errorMessage(e)
      if (code === 'NOT_REPO' || msg.includes('NOT_REPO') || msg.includes('not a git')) {
        status.value = null
        notRepo.value = true
        log.value = []
      } else {
        toast.error(msg)
      }
    } finally {
      loading.value = false
    }
  }

  async function init(rootPath?: string) {
    const root = rootPath ?? requireRoot()
    await api.git.init(root)
    await refresh(root)
  }

  async function commit(message: string) {
    const toast = useToastStore()
    if (!(await ensureCryptoSession())) return
    const root = requireRoot()
    try {
      // Seal any plaintext before commit
      await api.fs.sealPlaintextNotes(root)
      await api.git.commit(root, message)
      toast.success('提交成功（磁盘密文）')
      await refresh(root)
      await useWorkspaceStore().refresh()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  async function push() {
    const toast = useToastStore()
    const settings = useSettingsStore()
    const root = requireRoot()
    try {
      await api.git.push(root, settings.giteeToken || null)
      toast.success('推送成功（密文）')
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        await sendNotification({ title: 'Lax1024 Tools', body: 'Git 推送完成' })
      } catch {
        /* ignore */
      }
      await refresh(root)
    } catch (e) {
      const msg = errorMessage(e)
      if (
        msg.toLowerCase().includes('conflict') ||
        (isAppError(e) && (e as { code?: string }).code === 'GIT_CONFLICT')
      ) {
        try {
          const { sendNotification } = await import('@tauri-apps/plugin-notification')
          await sendNotification({ title: 'Lax1024 Tools', body: '检测到 Git 冲突' })
        } catch {
          /* ignore */
        }
      }
      toast.error(msg)
      throw e
    }
  }

  async function pull() {
    const toast = useToastStore()
    const settings = useSettingsStore()
    if (!(await ensureCryptoSession())) return
    const root = requireRoot()
    try {
      await api.git.pull(root, settings.giteeToken || null)
      toast.success('拉取成功（密文已同步，打开时解密显示）')
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        await sendNotification({ title: 'Lax1024 Tools', body: 'Git 拉取完成' })
      } catch {
        /* ignore */
      }
      await refresh(root)
      await useWorkspaceStore().refresh()
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  return { status, log, loading, notRepo, refresh, init, commit, push, pull }
})
