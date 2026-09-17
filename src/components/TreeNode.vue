<script setup lang="ts">
import { computed, ref } from 'vue'
import type { FileNode } from '../types'
import { useEditorStore } from '../stores/editor'
import { useToastStore } from '../stores/toast'
import { pathsEqual, useTreeDragApi } from '../utils/tree-drag'

const props = defineProps<{
  node: FileNode
  depth: number
  currentFile: string | null
}>()

const emit = defineEmits<{
  'context-menu': [payload: { path: string; x: number; y: number }]
}>()

const editor = useEditorStore()
const toast = useToastStore()
const dragApi = useTreeDragApi()
const drag = dragApi.state
const expanded = ref(true)

const isSource = computed(
  () => drag.active && !!drag.fromPath && pathsEqual(drag.fromPath, props.node.path),
)
const isDropTarget = computed(
  () =>
    props.node.isDir &&
    drag.active &&
    !!drag.overDir &&
    pathsEqual(drag.overDir, props.node.path) &&
    !isSource.value,
)

async function onClick(e: MouseEvent) {
  if (drag.suppressClick) {
    drag.suppressClick = false
    e.preventDefault()
    e.stopPropagation()
    return
  }
  if (props.node.isDir) {
    expanded.value = !expanded.value
    return
  }
  if (!props.node.isNote) {
    toast.info('该文件类型不可在编辑器中打开')
    return
  }
  await editor.selectAndLoad(props.node.path)
}

function onContext(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  emit('context-menu', { path: props.node.path, x: e.clientX, y: e.clientY })
}

function onPointerDown(e: PointerEvent) {
  dragApi.onNodePointerDown({
    path: props.node.path,
    name: props.node.name,
    isDir: props.node.isDir,
    event: e,
  })
}

function fileIcon(node: FileNode): string {
  if (node.isDir) return expanded.value ? '▾' : '▸'
  if (node.isNote) return '📄'
  return '📎'
}
</script>

<template>
  <div class="tree-node" :class="{ 'is-source': isSource }">
    <div
      class="node"
      :class="{
        active: !node.isDir && node.isNote && currentFile === node.path,
        'drop-target': isDropTarget,
        dragging: isSource,
        folder: node.isDir,
        binary: !node.isDir && !node.isNote,
      }"
      :style="{ paddingLeft: `${depth * 14 + 6}px` }"
      :data-node-path="node.path"
      :data-is-dir="node.isDir ? '1' : '0'"
      :title="node.isNote || node.isDir ? undefined : '仅展示，不可打开'"
      @click="onClick"
      @contextmenu="onContext"
      @pointerdown="onPointerDown"
    >
      <span class="grip" title="拖拽移动" aria-hidden="true">⋮⋮</span>
      <span class="icon">{{ fileIcon(node) }}</span>
      <span class="name">{{ node.name }}</span>
    </div>
    <template v-if="node.isDir && expanded && node.children">
      <TreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :current-file="currentFile"
        @context-menu="emit('context-menu', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.tree-node.is-source {
  pointer-events: none;
}
.node {
  display: flex;
  gap: 0.3rem;
  align-items: center;
  padding: 0.32rem 0.4rem;
  border-radius: 5px;
  cursor: grab;
  font-size: 0.9rem;
  user-select: none;
  touch-action: none;
}
.node:active {
  cursor: grabbing;
}
.node.folder.drop-target {
  outline: 2px solid var(--accent);
  background: var(--accent-soft);
}
.node.dragging {
  opacity: 0.35;
}
.node:hover {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.node.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}
.node.binary {
  color: var(--muted);
  cursor: default;
}
.node.binary .name {
  font-style: italic;
}
.grip {
  color: var(--muted);
  font-size: 0.7rem;
  letter-spacing: -0.12em;
  opacity: 0.75;
  width: 1rem;
  flex-shrink: 0;
}
.icon {
  width: 1rem;
  text-align: center;
  font-size: 0.75rem;
  flex-shrink: 0;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
