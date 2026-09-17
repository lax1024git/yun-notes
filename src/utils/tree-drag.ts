import { inject, provide, reactive, type InjectionKey } from 'vue'

export type TreeDragState = {
  active: boolean
  fromPath: string | null
  fromName: string | null
  /** 解析后的目标目录；'__root__' 表示工作区根 */
  overDir: string | null
  x: number
  y: number
  suppressClick: boolean
}

export type TreeDragApi = {
  state: TreeDragState
  onNodePointerDown: (payload: {
    path: string
    name: string
    isDir: boolean
    event: PointerEvent
  }) => void
}

export const TREE_DRAG_API_KEY: InjectionKey<TreeDragApi> = Symbol('tree-drag-api')

export function createTreeDragState(): TreeDragState {
  return reactive({
    active: false,
    fromPath: null,
    fromName: null,
    overDir: null,
    x: 0,
    y: 0,
    suppressClick: false,
  })
}

export function provideTreeDragApi(api: TreeDragApi) {
  provide(TREE_DRAG_API_KEY, api)
}

export function useTreeDragApi(): TreeDragApi {
  const api = inject(TREE_DRAG_API_KEY, null)
  if (!api) throw new Error('tree drag api missing')
  return api
}

function normPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function pathsEqual(a: string, b: string): boolean {
  return normPath(a) === normPath(b)
}

export function isUnderPath(parent: string, child: string): boolean {
  const p = normPath(parent)
  const c = normPath(child)
  return c === p || c.startsWith(`${p}/`)
}

export function parentDir(path: string): string {
  const useBack = path.includes('\\')
  const norm = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = norm.lastIndexOf('/')
  if (idx <= 0) return path
  const parent = norm.slice(0, idx)
  return useBack ? parent.replace(/\//g, '\\') : parent
}

/** 根据指针位置解析可放置的目标目录（跳过拖拽源及其子树） */
export function resolveOverDir(
  clientX: number,
  clientY: number,
  skipPath: string | null,
): string | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const raw of stack) {
    const el = raw as HTMLElement
    if (!el || typeof el.closest !== 'function') continue
    if (el.classList?.contains('drag-ghost') || el.closest('.drag-ghost')) continue

    const node = el.closest('[data-node-path]') as HTMLElement | null
    if (node?.dataset.nodePath) {
      const p = node.dataset.nodePath
      if (skipPath && (pathsEqual(p, skipPath) || isUnderPath(skipPath, p))) {
        continue
      }
      if (node.dataset.isDir === '1') return p
      return parentDir(p)
    }

    if (el.closest('[data-drop-root]')) return '__root__'
  }
  return null
}
