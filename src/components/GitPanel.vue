<script setup lang="ts">
import { ref, watch } from 'vue'
import { api } from '../api/tauri'
import { useGitStore } from '../stores/git'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const git = useGitStore()
const settings = useSettingsStore()
const message = ref('')

watch(
  () => workspace.root,
  (root) => {
    if (root) void git.refresh(root)
  },
  { immediate: true },
)

async function syncRemoteFromSettings() {
  if (!workspace.root) return
  const url = settings.remoteUrl.trim()
  if (!url) return
  try {
    await api.git.status(workspace.root)
  } catch {
    return
  }
  await api.git.setRemote(workspace.root, url)
}

async function init() {
  if (!workspace.root) return
  await git.init(workspace.root)
  await syncRemoteFromSettings()
  await git.refresh(workspace.root)
}

async function commit() {
  if (!workspace.root || !message.value.trim()) return
  await git.commit(workspace.root, message.value.trim())
  message.value = ''
}

async function push() {
  if (!workspace.root) return
  await syncRemoteFromSettings()
  await git.push(workspace.root)
}

async function pull() {
  if (!workspace.root) return
  await syncRemoteFromSettings()
  await git.pull(workspace.root)
}

function statusColor(status: string) {
  if (status.includes('未跟踪')) return 'var(--muted)'
  if (status.includes('修改')) return 'var(--warning)'
  if (status.includes('暂存')) return 'var(--success)'
  if (status.includes('删除')) return 'var(--danger)'
  return 'var(--text)'
}
</script>

<template>
  <div class="stack">
    <h3>Git</h3>
    <p class="muted tip">远程地址请在「设置」中配置</p>

    <template v-if="!workspace.root">
      <p class="muted">打开工作区后可用</p>
    </template>
    <template v-else-if="git.notRepo">
      <button class="primary" @click="init">初始化仓库</button>
    </template>
    <template v-else-if="git.status">
      <div class="muted">
        分支 {{ git.status.branch }} · ↑{{ git.status.ahead }} ↓{{ git.status.behind }}
      </div>
      <ul class="changes">
        <li
          v-for="c in git.status.changes"
          :key="c.path + c.status"
          :style="{ color: statusColor(c.status) }"
        >
          {{ c.status }} · {{ c.path }}
        </li>
        <li v-if="!git.status.changes.length" class="muted">无变更</li>
      </ul>
      <input v-model="message" placeholder="提交说明" @keydown.enter="commit" />
      <div class="row">
        <button class="primary" :disabled="!message.trim()" @click="commit">提交</button>
        <button @click="push">推送</button>
        <button @click="pull">拉取</button>
        <button @click="workspace.root && git.refresh(workspace.root)">刷新</button>
      </div>
      <div v-if="git.log.length" class="log">
        <div v-for="item in git.log" :key="item.id" class="log-item">
          <code>{{ item.shortId }}</code> {{ item.message }}
        </div>
      </div>
    </template>
    <p v-else-if="git.loading" class="muted">加载中…</p>
  </div>
</template>

<style scoped>
.tip {
  font-size: 0.75rem;
  margin: 0;
}
.changes {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 120px;
  overflow: auto;
  font-size: 0.82rem;
}
.log {
  max-height: 100px;
  overflow: auto;
  font-size: 0.78rem;
  color: var(--muted);
}
.log-item {
  margin-bottom: 0.2rem;
}
code {
  color: var(--accent);
}
</style>
