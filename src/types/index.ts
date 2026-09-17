export interface AppError {
  code: string
  message: string
}

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  /** 可打开编辑的笔记；false 时仅展示 */
  isNote: boolean
  children?: FileNode[] | null
  size?: number | null
  modified?: number | null
}

export interface SearchHit {
  path: string
  line: number
  preview: string
}

export interface ChangeItem {
  path: string
  status: string
  staged: boolean
}

export interface GitStatus {
  branch: string
  ahead: number
  behind: number
  changes: ChangeItem[]
}

export interface CommitInfo {
  id: string
  shortId: string
  message: string
  author: string
  time: number
}

export interface GiteeUser {
  id: number
  login: string
  name?: string | null
  avatarUrl?: string | null
}

export interface GiteeRepo {
  id: number
  name: string
  fullName: string
  htmlUrl: string
  sshUrl?: string | null
  httpsUrl?: string | null
  private: boolean
  description?: string | null
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type EditorMode = 'edit' | 'split' | 'preview'
