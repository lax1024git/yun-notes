<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import { api, errorMessage } from '../api/tauri'
import { useEditorStore } from '../stores/editor'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'
import {
  createTreeDragState,
  isUnderPath,
  pathsEqual,
  provideTreeDragApi,
  resolveOverDir,
  type TreeDragApi,
} from '../utils/tree-drag'
import TreeNode from './TreeNode.vue'

const workspace = useWorkspaceStore()
const editor = useEditorStore()
const toast = useToastStore()
const drag = createTreeDragState()

const rootDropActive = computed(() => drag.active && drag.overDir === '__root__')

const menu = ref<{
  visible: boolean
  x: number
  y: number
  path: string
  isDir: boolean
  /** directory to create new entries into */
  targetDir: string
}>({
  visible: false,
  x: 0,
  y: 0,
  path: '',
  isDir: true,
  targetDir: '',
})

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  if (dir.endsWith('\\') || dir.endsWith('/')) return `${dir}${name}`
  return `${dir}${sep}${name}`
}

function baseName(path: string): string {
  const norm = path.replace(/\\/g, '/')
  const parts = norm.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

function parentOf(path: string): string {
  const useBack = path.includes('\\')
  const norm = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const idx = norm.lastIndexOf('/')
  if (idx <= 0) return path
  const parent = norm.slice(0, idx)
  return useBack ? parent.replace(/\//g, '\\') : parent
}

function closeMenu() {
  menu.value.visible = false
}

function openMenu(payload: {
  path: string
  isDir: boolean
  targetDir: string
  x: number
  y: number
}) {
  const pad = 8
  const menuH = 160
  const x = Math.min(payload.x, window.innerWidth - 148 - pad)
  const y = Math.min(payload.y, window.innerHeight - menuH - pad)
  menu.value = {
    visible: true,
    x,
    y,
    path: payload.path,
    isDir: payload.isDir,
    targetDir: payload.targetDir,
  }
}

function onContextMenu(payload: { path: string; isDir: boolean; x: number; y: number }) {
  const targetDir = payload.isDir
    ? payload.path
    : parentOf(payload.path) || workspace.root || payload.path
  openMenu({
    path: payload.path,
    isDir: payload.isDir,
    targetDir,
    x: payload.x,
    y: payload.y,
  })
}

function onRootContextMenu(e: MouseEvent) {
  if (!workspace.root) return
  e.preventDefault()
  openMenu({
    path: workspace.root,
    isDir: true,
    targetDir: workspace.root,
    x: e.clientX,
    y: e.clientY,
  })
}

function onDocClick() {
  if (menu.value.visible) closeMenu()
}

onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => {
  document.removeEventListener('click', onDocClick)
  teardownDragListeners()
})

async function pickWorkspace() {
  const selected = await pickDirectory({ directory: true, multiple: false })
  if (typeof selected === 'string') await workspace.openWorkspace(selected)
}

async function createInDir(dir: string, kind: 'file' | 'dir') {
  if (!dir) return
  if (kind === 'file') {
    const name = window.prompt('新文件名（含 .md）', 'untitled.md')
    if (!name) return
    try {
      const path = joinPath(dir, name)
      await api.fs.createFile(path)
      await workspace.refresh()
      toast.success(`已创建：${name}`)
    } catch (e) {
      toast.error(errorMessage(e))
    }
    return
  }
  const name = window.prompt('新目录名', 'notes')
  if (!name) return
  try {
    await api.fs.createDir(joinPath(dir, name))
    await workspace.refresh()
    toast.success(`已创建目录：${name}`)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function newFile() {
  if (!workspace.root) return
  await createInDir(workspace.root, 'file')
}

async function newDir() {
  if (!workspace.root) return
  await createInDir(workspace.root, 'dir')
}

async function onNewFileHere() {
  const dir = menu.value.targetDir
  closeMenu()
  await createInDir(dir, 'file')
}

async function onNewDirHere() {
  const dir = menu.value.targetDir
  closeMenu()
  await createInDir(dir, 'dir')
}

async function onRename(path: string) {
  closeMenu()
  const name = baseName(path)
  const nextName = window.prompt('新名称', name)
  if (!nextName || nextName === name) return
  const parent = parentOf(path)
  const next = joinPath(parent || workspace.root || '', nextName)
  try {
    await api.fs.renamePath(path, next)
    if (workspace.currentFile === path) {
      workspace.selectFile(next)
      await editor.load(next)
    }
    await workspace.refresh()
    toast.success('已重命名')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function onRemove(path: string) {
  closeMenu()
  if (!window.confirm(`确定删除？\n${baseName(path)}`)) return
  try {
    await api.fs.deletePath(path)
    if (workspace.currentFile === path) workspace.currentFile = null
    await workspace.refresh()
    toast.success('已删除')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function moveEntry(from: string, toDirRaw: string) {
  if (!workspace.root) return

  const toDir = toDirRaw === '__root__' ? workspace.root : toDirRaw
  if (!toDir) {
    toast.error('无效的目标目录')
    return
  }

  const fromParent = parentOf(from)
  if (pathsEqual(fromParent, toDir)) {
    toast.info('已在目标目录中')
    return
  }

  if (isUnderPath(from, toDir)) {
    toast.error('不能移动到自身或其子目录中')
    return
  }

  const name = baseName(from)
  const dest = joinPath(toDir, name)
  if (pathsEqual(dest, from)) return

  try {
    await api.fs.renamePath(from, dest)
    if (workspace.currentFile && pathsEqual(workspace.currentFile, from)) {
      workspace.selectFile(dest)
      await editor.load(dest)
    } else if (workspace.currentFile && isUnderPath(from, workspace.currentFile)) {
      const rel = workspace.currentFile.slice(from.length).replace(/^[\\/]+/, '')
      const next = joinPath(dest, rel)
      workspace.selectFile(next)
      await editor.load(next)
    }
    await workspace.refresh()
    toast.success(`已移动到：${baseName(toDir) || toDir}`)
  } catch (e) {
    toast.error(`移动失败：${errorMessage(e)}`)
  }
}

/* ---------------- pointer drag (document capture) ---------------- */

let dragCleanup: (() => void) | null = null

function teardownDragListeners() {
  dragCleanup?.()
  dragCleanup = null
}

function resetDragVisual() {
  drag.active = false
  drag.fromPath = null
  drag.fromName = null
  drag.overDir = null
}

function onNodePointerDown(payload: {
  path: string
  name: string
  isDir: boolean
  event: PointerEvent
}) {
  const e = payload.event
  if (e.button !== 0) return
  // 不 preventDefault，保证普通点击仍可选中文件

  teardownDragListeners()

  const startX = e.clientX
  const startY = e.clientY
  const fromPath = payload.path
  const fromName = payload.name
  let started = false

  const onPointerMove = (ev: PointerEvent) => {
    const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY)
    if (!started) {
      if (dist < 4) return
      started = true
      drag.active = true
      drag.fromPath = fromPath
      drag.fromName = fromName
      drag.suppressClick = true
      document.body.classList.add('nw-tree-dragging')
    }

    drag.x = ev.clientX
    drag.y = ev.clientY
    drag.overDir = resolveOverDir(ev.clientX, ev.clientY, fromPath)
  }

  const finish = (_ev: PointerEvent, commit: boolean) => {
    teardownDragListeners()
    document.body.classList.remove('nw-tree-dragging')

    const toDir = drag.overDir
    const from = drag.fromPath
    const didDrag = started

    resetDragVisual()

    if (!didDrag || !from) return

    drag.suppressClick = true
    window.setTimeout(() => {
      drag.suppressClick = false
    }, 250)

    if (!commit) return

    if (!toDir) {
      toast.info('请拖到目标文件夹（高亮）或空白处后松开')
      return
    }
    void moveEntry(from, toDir)
  }

  const onUp = (ev: PointerEvent) => finish(ev, true)
  const onCancel = (ev: PointerEvent) => finish(ev, false)
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') finish(e, false)
  }

  // capture 阶段挂在 document，避开 WebView pointer capture 丢事件
  document.addEventListener('pointermove', onPointerMove, true)
  document.addEventListener('pointerup', onUp, true)
  document.addEventListener('pointercancel', onCancel, true)
  window.addEventListener('keydown', onKey, true)

  dragCleanup = () => {
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('pointerup', onUp, true)
    document.removeEventListener('pointercancel', onCancel, true)
    window.removeEventListener('keydown', onKey, true)
  }
}

const dragApi: TreeDragApi = {
  state: drag,
  onNodePointerDown,
}
provideTreeDragApi(dragApi)
</script>

<template>
  <div class="file-tree stack">
    <div class="row head" @contextmenu="onRootContextMenu">
      <strong :title="workspace.root || undefined">{{ workspace.rootName || '工作区' }}</strong>
      <button type="button" @click="pickWorkspace">打开</button>
      <button type="button" :disabled="!workspace.root" @click="newFile">新建文件</button>
      <button type="button" :disabled="!workspace.root" @click="newDir">新建目录</button>
    </div>
    <p v-if="!workspace.root" class="muted">
      请选择笔记目录（磁盘存密文，编辑器打开时解密显示）
    </p>
    <p v-else class="muted hint">
      磁盘密文 · 打开解密显示 · 右键可新建文件/目录
    </p>

    <div
      v-if="workspace.root"
      class="tree-body"
      data-drop-root="1"
      :class="{ 'root-drop': rootDropActive, dragging: drag.active }"
      @contextmenu="onRootContextMenu"
    >
      <TreeNode
        v-for="node in workspace.tree"
        :key="node.path"
        :node="node"
        :depth="0"
        :current-file="workspace.currentFile"
        @context-menu="onContextMenu"
      />
      <div v-if="!workspace.tree.length" class="muted empty">空目录 — 右键新建，或把文件拖到这里</div>
    </div>

    <Teleport to="body">
      <div
        v-if="drag.active && drag.fromName"
        class="drag-ghost"
        :style="{ left: `${drag.x + 14}px`, top: `${drag.y + 14}px` }"
      >
        移动：{{ drag.fromName }}
      </div>
      <div
        v-if="menu.visible"
        class="ctx-menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @click.stop
        @contextmenu.prevent
      >
        <button type="button" @click="onNewFileHere">新建文件</button>
        <button type="button" @click="onNewDirHere">新建目录</button>
        <div
          v-if="menu.path && menu.path !== workspace.root"
          class="ctx-sep"
          role="separator"
        />
        <button
          v-if="menu.path && menu.path !== workspace.root"
          type="button"
          @click="onRename(menu.path)"
        >
          重命名
        </button>
        <button
          v-if="menu.path && menu.path !== workspace.root"
          type="button"
          class="danger"
          @click="onRemove(menu.path)"
        >
          删除
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.head {
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}
.head strong {
  margin-right: auto;
}
.hint {
  font-size: 0.75rem;
  margin: 0 0 0.35rem;
}
.tree-body {
  min-height: 140px;
  border-radius: 6px;
  padding: 0.25rem;
  border: 1px dashed transparent;
}
.tree-body.dragging {
  border-color: color-mix(in srgb, var(--accent) 45%, transparent);
}
.tree-body.root-drop {
  outline: 2px dashed var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.empty {
  padding: 1rem 0.5rem;
  font-size: 0.8rem;
}
</style>

<style>
.drag-ghost {
  position: fixed;
  z-index: 3000;
  pointer-events: none;
  padding: 0.4rem 0.7rem;
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  box-shadow: 0 8px 20px rgb(0 0 0 / 25%);
  font-size: 0.85rem;
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
body.nw-tree-dragging {
  cursor: grabbing !important;
  user-select: none !important;
}
body.nw-tree-dragging * {
  cursor: grabbing !important;
}
.ctx-menu {
  position: fixed;
  z-index: 1000;
  min-width: 132px;
  padding: 0.3rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.ctx-menu button {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 0.45rem 0.65rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.ctx-menu button:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.ctx-menu button.danger:hover {
  background: color-mix(in srgb, var(--danger) 16%, transparent);
  color: var(--danger);
}
.ctx-sep {
  height: 1px;
  margin: 0.2rem 0.35rem;
  background: var(--border);
}
</style>
