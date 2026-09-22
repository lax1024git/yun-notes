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
const pinCount = ref(0)

const tabs: { id: ToolId; code: string; label: string }[] = [
  { id: 'time', code: '01', label: '时间' },
  { id: 'json', code: '02', label: 'JSON' },
  { id: 'image', code: '03', label: '图片' },
  { id: 'crypto', code: '04', label: '加解密' },
]

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

const title = computed(() => tabs.find((t) => t.id === tool.value)?.label ?? '工具箱')

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
    <button
      ref="triggerBtn"
      type="button"
      class="trigger"
      :class="{ active: open }"
      @click="toggle"
    >
      <span class="trig-ico" aria-hidden="true" />
      工具箱
    </button>
    <Teleport to="body">
      <div
        v-show="open"
        ref="panelRoot"
        class="console"
        :class="{ wide }"
        role="dialog"
        aria-label="快捷工具箱"
      >
        <div class="console-head">
          <div class="head-left">
            <span class="status-dot" />
            <div>
              <div class="console-title">QUICK TOOLS</div>
              <div class="console-sub">MODULE · {{ title }}</div>
            </div>
          </div>
          <button type="button" class="icon-close" aria-label="关闭" @click="close">×</button>
        </div>

        <div class="rail">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="rail-tab"
            :class="{ on: tool === t.id }"
            @click="tool = t.id"
          >
            <span class="code">{{ t.code }}</span>
            <span class="lab">{{ t.label }}</span>
          </button>
        </div>

        <div class="console-body">
          <h3 class="sr-only">{{ title }}</h3>
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
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}
.trig-ico {
  width: 7px;
  height: 7px;
  background: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent);
}
.trigger.active {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.console {
  position: fixed;
  top: 52px;
  right: 12px;
  z-index: 1200;
  width: min(440px, calc(100vw - 24px));
  max-height: min(620px, calc(100vh - 68px));
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-elevated) 96%, transparent);
  box-shadow: var(--shadow);
  backdrop-filter: blur(14px);
}
.console.wide {
  width: min(760px, calc(100vw - 24px));
  max-height: min(740px, calc(100vh - 68px));
}
.console::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2), transparent);
  z-index: 1;
}
.console-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.7rem 0.85rem 0.55rem;
  border-bottom: 1px solid var(--border);
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--accent) 8%, transparent),
    transparent
  );
}
.head-left {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 1px;
  background: var(--success);
  box-shadow: 0 0 8px color-mix(in srgb, var(--success) 55%, transparent);
  flex-shrink: 0;
}
.console-title {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  font-weight: 700;
}
.console-sub {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.1em;
  color: var(--muted);
  margin-top: 0.1rem;
}
.rail {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, transparent);
}
.rail-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  border: none;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
  padding: 0.45rem 0.55rem;
  font-size: 0.78rem;
  text-align: left;
}
.rail-tab:last-child {
  border-right: none;
}
.rail-tab .code {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.rail-tab .lab {
  font-weight: 600;
}
.rail-tab.on {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  box-shadow: inset 0 -2px 0 var(--accent);
}
.rail-tab.on .code {
  color: var(--accent);
}
.console-body {
  padding: 0.75rem 0.85rem 0.9rem;
  overflow: auto;
  min-height: 0;
  flex: 1;
}
.icon-close {
  border: 1px solid var(--border);
  background: transparent;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.15rem 0.45rem;
  color: var(--muted);
  border-radius: var(--radius);
}
.icon-close:hover {
  color: var(--text);
  border-color: var(--border-strong);
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
