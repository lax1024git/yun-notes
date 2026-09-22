<script setup lang="ts">
import { computed, ref } from 'vue'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import { useWorkspaceStore } from '../stores/workspace'
import { useToastStore } from '../stores/toast'
import { errorMessage } from '../api/tauri'
import WorkspaceTabSettings from './WorkspaceTabSettings.vue'

const workspace = useWorkspaceStore()
const toast = useToastStore()

const settingsId = ref<string | null>(null)
const settingsOpen = computed({
  get: () => !!settingsId.value,
  set: (v: boolean) => {
    if (!v) settingsId.value = null
  },
})

const picking = ref(false)

function asPath(selected: string | string[] | null): string | null {
  if (typeof selected === 'string' && selected) return selected
  if (Array.isArray(selected) && selected[0]) return selected[0]
  return null
}

/** Like a browser: create tab first, then attach a git project folder */
async function addWorkspace() {
  if (picking.value) return
  picking.value = true
  try {
    const id = await workspace.createBlankTab()
    const selected = await pickDirectory({
      directory: true,
      multiple: false,
      title: '选择 Git 项目目录（独立工作区）',
    })
    const path = asPath(selected)
    if (!path) {
      toast.info('已新建空白标签页，可稍后在此选择项目目录')
      return
    }
    await workspace.bindTabPath(id, path)
    toast.success(`已打开项目：${path.split(/[/\\]/).pop()}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    picking.value = false
  }
}

async function pickForActive() {
  if (!workspace.activeId || picking.value) return
  picking.value = true
  try {
    const selected = await pickDirectory({
      directory: true,
      multiple: false,
      title: '选择 Git 项目目录',
    })
    const path = asPath(selected)
    if (!path) return
    await workspace.bindTabPath(workspace.activeId, path)
    toast.success(`已绑定项目：${path.split(/[/\\]/).pop()}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    picking.value = false
  }
}

async function onSwitch(id: string) {
  try {
    await workspace.switchTab(id)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

function openSettings(id: string, e?: Event) {
  e?.stopPropagation()
  e?.preventDefault()
  settingsId.value = id
}

async function onCloseTab(id: string, e: Event) {
  e.stopPropagation()
  e.preventDefault()
  const tab = workspace.tabs.find((t) => t.id === id)
  if (!tab) return
  if (!window.confirm(`关闭「${tab.name}」？\n不会删除本地文件。`)) return
  await workspace.removeTab(id)
}

const showEmpty = computed(() => {
  const t = workspace.activeTab
  return !!t && !t.path.trim()
})
</script>

<template>
  <div class="ws-tabs">
    <div class="rail" role="tablist" aria-label="工作区">
      <div
        v-for="tab in workspace.tabs"
        :key="tab.id"
        role="tab"
        class="tab"
        :class="{ on: tab.id === workspace.activeId, empty: !tab.path }"
        :title="tab.path || '未绑定项目目录'"
        @click="onSwitch(tab.id)"
        @dblclick="openSettings(tab.id)"
      >
        <span class="name">{{ tab.name }}</span>
        <span class="actions">
          <button
            type="button"
            class="icon-btn"
            title="工作区设置"
            @click="openSettings(tab.id, $event)"
          >
            ···
          </button>
          <button
            type="button"
            class="icon-btn"
            title="关闭"
            @click="onCloseTab(tab.id, $event)"
          >
            ×
          </button>
        </span>
      </div>
      <button
        type="button"
        class="add"
        title="新建标签页并打开 Git 项目"
        :disabled="picking"
        @click="addWorkspace"
      >
        {{ picking ? '…' : '+' }}
      </button>
    </div>

    <div v-if="showEmpty" class="empty-pane">
      <div class="empty-card stack">
        <div class="eyebrow">NEW TAB</div>
        <h3>打开一个独立的 Git 项目</h3>
        <p class="muted">
          每个标签页对应一个本地仓库目录与可选远程地址，互不影响。
        </p>
        <div class="row">
          <button type="button" class="primary" :disabled="picking" @click="pickForActive">
            选择本地项目目录
          </button>
          <button
            type="button"
            :disabled="!workspace.activeId"
            @click="openSettings(workspace.activeId!)"
          >
            设置远程 / 克隆
          </button>
        </div>
      </div>
    </div>

    <WorkspaceTabSettings v-model:open="settingsOpen" :tab-id="settingsId" />
  </div>
</template>

<style scoped>
.ws-tabs {
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 80%, transparent);
  flex-shrink: 0;
}
.rail {
  display: flex;
  align-items: stretch;
  gap: 0;
  overflow-x: auto;
  padding: 0 0.25rem;
  min-height: 38px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  max-width: 220px;
  border-right: 1px solid var(--border);
  padding: 0.35rem 0.25rem 0.35rem 0.7rem;
  font-size: 0.82rem;
  color: var(--muted);
  cursor: pointer;
  user-select: none;
}
.tab.on {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  box-shadow: inset 0 -2px 0 var(--accent);
}
.tab.empty .name {
  font-style: italic;
  opacity: 0.85;
}
.tab .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  min-width: 0;
}
.actions {
  display: inline-flex;
  flex-shrink: 0;
}
.icon-btn {
  border: none;
  background: transparent;
  color: var(--muted);
  padding: 0.15rem 0.3rem;
  font-size: 0.85rem;
  line-height: 1;
  border-radius: var(--radius);
  opacity: 0.5;
}
.tab:hover .icon-btn,
.tab.on .icon-btn {
  opacity: 1;
}
.icon-btn:hover {
  background: var(--accent-soft);
  color: var(--accent);
}
.add {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 1.25rem;
  min-width: 40px;
  padding: 0 0.75rem;
  border-radius: 0;
  font-weight: 700;
  flex-shrink: 0;
}
.add:hover:not(:disabled) {
  background: var(--accent-soft);
}
.add:disabled {
  opacity: 0.5;
}
.empty-pane {
  padding: 1.25rem 1rem 1.5rem;
  border-top: 1px dashed var(--border);
  background: color-mix(in srgb, var(--bg) 40%, transparent);
}
.empty-card {
  max-width: 420px;
  margin: 0 auto;
  text-align: center;
  gap: 0.55rem;
}
.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.14em;
  color: var(--accent);
}
.empty-card h3 {
  margin: 0;
  font-size: 1.05rem;
}
.empty-card .row {
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 0.35rem;
}
</style>
