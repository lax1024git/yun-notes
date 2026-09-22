<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, errorMessage } from '../api/tauri'
import { useGitStore } from '../stores/git'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()
const git = useGitStore()
const toast = useToastStore()
const message = ref('')

const visibleChanges = computed(() => {
  const changes = git.status?.changes ?? []
  return changes.filter((c) => {
    const p = c.path.replace(/\\/g, '/')
    const base = p.split('/').pop() || p
    if (base.startsWith('.')) return false
    if (base === '.nw-crypto.json' || p.includes('.nw-crypto.json')) return false
    return true
  })
})

watch(
  () => workspace.root,
  (root) => {
    if (root) void git.refresh(root)
  },
  { immediate: true },
)

async function syncRemoteFromSettings() {
  if (!workspace.root) return
  const url = workspace.remoteUrl.trim()
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
  try {
    await api.project.init(workspace.root)
    await git.init(workspace.root)
    await syncRemoteFromSettings()
    await git.refresh(workspace.root)
    await workspace.refresh()
    toast.success('工作区已初始化（磁盘密文 · Git 同步密文）')
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function commit() {
  if (!workspace.root || !message.value.trim()) return
  await git.commit(message.value.trim())
  message.value = ''
}

async function push() {
  if (!workspace.root) return
  await syncRemoteFromSettings()
  await git.push()
}

async function pull() {
  if (!workspace.root) return
  await syncRemoteFromSettings()
  await git.pull()
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
    <p class="muted tip">
      笔记在磁盘上为密文；编辑器打开时解密。Git 推送/拉取的也是密文。
    </p>

    <template v-if="!workspace.root">
      <p class="muted">请先打开工作区</p>
    </template>
    <template v-else-if="git.notRepo">
      <button class="primary" @click="init">初始化 Git 仓库</button>
    </template>
    <template v-else-if="git.status">
      <div class="muted">
        分支 {{ git.status.branch }} · ↑{{ git.status.ahead }} ↓{{ git.status.behind }}
      </div>
      <ul class="changes">
        <li
          v-for="c in visibleChanges"
          :key="c.path + c.status"
          :style="{ color: statusColor(c.status) }"
        >
          {{ c.status }} · {{ c.path }}
        </li>
        <li v-if="!visibleChanges.length" class="muted">无变更</li>
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
