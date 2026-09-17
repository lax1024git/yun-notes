import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, errorMessage, isAppError } from '../api/tauri'
import type { CommitInfo, GitStatus } from '../types'
import { useSettingsStore } from './settings'
import { useToastStore } from './toast'

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatus | null>(null)
  const log = ref<CommitInfo[]>([])
  const loading = ref(false)
  const notRepo = ref(false)

  async function refresh(root: string) {
    const toast = useToastStore()
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
      // Tauri may wrap error as stringified object
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

  async function init(root: string) {
    await api.git.init(root)
    await refresh(root)
  }

  async function commit(root: string, message: string) {
    const toast = useToastStore()
    try {
      await api.git.commit(root, message)
      toast.success('提交成功')
      await refresh(root)
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  async function push(root: string) {
    const toast = useToastStore()
    const settings = useSettingsStore()
    try {
      await api.git.push(root, settings.giteeToken || null)
      toast.success('推送成功')
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        await sendNotification({ title: 'Note Workstation', body: 'Git 推送完成' })
      } catch {
        /* ignore */
      }
      await refresh(root)
    } catch (e) {
      const msg = errorMessage(e)
      if (msg.toLowerCase().includes('conflict') || (isAppError(e) && (e as { code?: string }).code === 'GIT_CONFLICT')) {
        try {
          const { sendNotification } = await import('@tauri-apps/plugin-notification')
          await sendNotification({ title: 'Note Workstation', body: '检测到 Git 冲突' })
        } catch {
          /* ignore */
        }
      }
      toast.error(msg)
      throw e
    }
  }

  async function pull(root: string) {
    const toast = useToastStore()
    const settings = useSettingsStore()
    try {
      await api.git.pull(root, settings.giteeToken || null)
      toast.success('拉取成功')
      try {
        const { sendNotification } = await import('@tauri-apps/plugin-notification')
        await sendNotification({ title: 'Note Workstation', body: 'Git 拉取完成' })
      } catch {
        /* ignore */
      }
      await refresh(root)
    } catch (e) {
      toast.error(errorMessage(e))
      throw e
    }
  }

  return { status, log, loading, notRepo, refresh, init, commit, push, pull }
})
