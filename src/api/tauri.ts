import { invoke } from '@tauri-apps/api/core'
import type {
  CommitInfo,
  FileNode,
  GiteeRepo,
  GiteeUser,
  GitStatus,
  SearchHit,
} from '../types'

export const api = {
  fs: {
    scanWorkspace: (root: string) => invoke<FileNode[]>('scan_workspace', { root }),
    readMd: (path: string) => invoke<string>('read_md', { path }),
    writeMd: (path: string, content: string) =>
      invoke<void>('write_md', { path, content }),
    createFile: (path: string) => invoke<void>('create_file', { path }),
    createDir: (path: string) => invoke<void>('create_dir', { path }),
    deletePath: (path: string) => invoke<void>('delete_path', { path }),
    renamePath: (old: string, newPath: string) =>
      invoke<void>('rename_path', { old, newPath }),
    searchFiles: (root: string, keyword: string) =>
      invoke<SearchHit[]>('search_files', { root, keyword }),
  },
  git: {
    init: (root: string) => invoke<void>('git_init', { root }),
    status: (root: string) => invoke<GitStatus>('git_status', { root }),
    commit: (root: string, message: string) =>
      invoke<string>('git_commit', { root, message }),
    log: (root: string, limit = 20) =>
      invoke<CommitInfo[]>('git_log', { root, limit }),
    clone: (url: string, dest: string) => invoke<void>('git_clone', { url, dest }),
    getRemote: (root: string) => invoke<string | null>('git_get_remote', { root }),
    setRemote: (root: string, url: string) =>
      invoke<void>('git_set_remote', { root, url }),
    push: (root: string, token?: string | null) =>
      invoke<void>('git_push', { root, token: token ?? null }),
    pull: (root: string, token?: string | null) =>
      invoke<void>('git_pull', { root, token: token ?? null }),
  },
  gitee: {
    buildAuthUrl: (httpsUrl: string, token: string) =>
      invoke<string>('gitee_build_auth_url', { httpsUrl, token }),
    getUser: (token: string) => invoke<GiteeUser>('gitee_get_user', { token }),
    listRepos: (token: string) => invoke<GiteeRepo[]>('gitee_list_repos', { token }),
    createRepo: (
      token: string,
      name: string,
      privateRepo: boolean,
      description?: string,
    ) =>
      invoke<GiteeRepo>('gitee_create_repo', {
        token,
        name,
        private: privateRepo,
        description: description ?? null,
      }),
  },
  lock: {
    hash: (password: string) =>
      invoke<{ salt: string; hash: string }>('app_lock_hash', { password }),
    verify: (password: string, salt: string, hash: string) =>
      invoke<boolean>('app_lock_verify', { password, salt, hash }),
  },
}

export function isAppError(e: unknown): e is { code?: string; message?: string } {
  return typeof e === 'object' && e !== null
}

export function errorMessage(e: unknown): string {
  if (typeof e === 'string') return e
  if (isAppError(e)) {
    const anyErr = e as { message?: string; code?: string }
    if (anyErr.message) return anyErr.message
    if (anyErr.code) return anyErr.code
  }
  return '未知错误'
}
