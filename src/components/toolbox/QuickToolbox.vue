<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import TimeConvertTool from './TimeConvertTool.vue'
import JsonFormatTool from './JsonFormatTool.vue'
import ImageConvertTool from './ImageConvertTool.vue'
import CryptoTool from './CryptoTool.vue'

export type ToolId = 'time' | 'json' | 'image' | 'crypto'

const TOOL_KEY = 'nw-toolbox-tab'
const VALID: ToolId[] = ['time', 'json', 'image', 'crypto']

const open = ref(false)
const tool = ref<ToolId>(loadTool())
/** >0 while native dialog / long task — don't auto-close panel */
const pinCount = ref(0)

function loadTool(): ToolId {
  try {
    const v = sessionStorage.getItem(TOOL_KEY) as ToolId | null
    if (v && VALID.includes(v)) return v
  } catch {
    /* ignore */
  }
  return 'time'
}

watch(tool, (v) => {
  try {
    sessionStorage.setItem(TOOL_KEY, v)
  } catch {
    /* ignore */
  }
})

const title = computed(() => {
  if (tool.value === 'time') return '时间转换'
  if (tool.value === 'json') return 'JSON 格式化'
  if (tool.value === 'image') return '图片转换'
  if (tool.value === 'crypto') return '加解密'
  return '快捷工具箱'
})

const wide = computed(
  () => tool.value === 'json' || tool.value === 'image' || tool.value === 'crypto',
)

provide('toolboxPin', {
  pin() {
    pinCount.value += 1
  },
  unpin() {
    pinCount.value = Math.max(0, pinCount.value - 1)
  },
})

function toggle() {
  open.value = !open.value
}

function close() {
  if (pinCount.value > 0) return
  open.value = false
}

function onDocPointer(e: MouseEvent) {
  if (!open.value || pinCount.value > 0) return
  const root = panelRoot.value
  const btn = triggerBtn.value
  const t = e.target as Node
  if (root?.contains(t) || btn?.contains(t)) return
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

const panelRoot = ref<HTMLElement | null>(null)
const triggerBtn = ref<HTMLElement | null>(null)

onMounted(() => {
  document.addEventListener('mousedown', onDocPointer)
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onDocPointer)
  window.removeEventListener('keydown', onKey)
})
</script>

<template>
  <div class="toolbox">
    <button ref="triggerBtn" type="button" :class="{ active: open }" @click="toggle">
      工具箱
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        ref="panelRoot"
        class="panel"
        :class="{ wide }"
        role="dialog"
        aria-label="快捷工具箱"
      >
        <div class="panel-head">
          <div class="tabs">
            <button
              type="button"
              class="tab"
              :class="{ on: tool === 'time' }"
              @click="tool = 'time'"
            >
              时间转换
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: tool === 'json' }"
              @click="tool = 'json'"
            >
              JSON 格式化
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: tool === 'image' }"
              @click="tool = 'image'"
            >
              图片转换
            </button>
            <button
              type="button"
              class="tab"
              :class="{ on: tool === 'crypto' }"
              @click="tool = 'crypto'"
            >
              加解密
            </button>
          </div>
          <button type="button" class="icon-close" aria-label="关闭" @click="close">×</button>
        </div>
        <div class="panel-body">
          <h3 class="sr-only">{{ title }}</h3>
          <!-- keep state when switching tabs -->
          <TimeConvertTool v-show="tool === 'time'" />
          <JsonFormatTool v-show="tool === 'json'" />
          <ImageConvertTool v-show="tool === 'image'" />
          <CryptoTool v-show="tool === 'crypto'" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.toolbox {
  position: relative;
  display: inline-flex;
}
button.active {
  border-color: var(--accent);
  color: var(--accent);
}
.panel {
  position: fixed;
  top: 48px;
  right: 12px;
  z-index: 1200;
  width: min(420px, calc(100vw - 24px));
  max-height: min(560px, calc(100vh - 64px));
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-elevated);
  box-shadow: 0 12px 40px rgb(0 0 0 / 18%);
  padding: 0.75rem 0.85rem 0.9rem;
}
.panel.wide {
  width: min(720px, calc(100vw - 24px));
  max-height: min(720px, calc(100vh - 64px));
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  flex: 1;
  min-width: 0;
}
.tab {
  padding: 0.3rem 0.55rem;
  font-size: 0.85rem;
}
.tab.on {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
  font-weight: 600;
}
.icon-close {
  border: none;
  background: transparent;
  font-size: 1.25rem;
  line-height: 1;
  padding: 0.15rem 0.4rem;
  color: var(--muted);
}
.icon-close:hover {
  color: var(--text);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
</style>
