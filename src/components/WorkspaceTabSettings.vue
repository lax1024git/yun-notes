<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { api, errorMessage } from '../api/tauri'
import { useToastStore } from '../stores/toast'
import { tabHasOwnCrypto, useWorkspaceStore } from '../stores/workspace'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ tabId: string | null }>()

const workspace = useWorkspaceStore()
const toast = useToastStore()

const name = ref('')
const remoteUrl = ref('')
const busy = ref(false)

const cryptoCurrent = ref('')
const cryptoPwd = ref('')
const cryptoPwd2 = ref('')
const cryptoBusy = ref(false)

const tab = computed(() =>
  props.tabId ? workspace.tabs.find((t) => t.id === props.tabId) ?? null : null,
)

const hasOwnCrypto = computed(() => tabHasOwnCrypto(tab.value))

const maskedRemote = computed(() =>
  remoteUrl.value
    .replace(/x-access-token:[^@/]+@/i, 'x-access-token:****@')
    .replace(/oauth2:[^@/]+@/i, 'oauth2:****@')
    .replace(/\/\/([^/@]+)@/, '//****@'),
)

watch(
  () => [open.value, props.tabId] as const,
  ([isOpen]) => {
    if (!isOpen || !tab.value) return
    name.value = tab.value.name
    remoteUrl.value = tab.value.remoteUrl
    cryptoCurrent.value = ''
    cryptoPwd.value = ''
    cryptoPwd2.value = ''
  },
  { immediate: true },
)

function onClose() {
  open.value = false
}

async function saveName() {
  if (!tab.value) return
  await workspace.renameTab(tab.value.id, name.value)
  toast.success('Tab 名称已保存')
}

async function saveRemote() {
  if (!tab.value) return
  const url = remoteUrl.value.trim()
  await workspace.updateTabRemote(tab.value.id, url)
  const tok = url.match(/https?:\/\/(?:(?:x-access-token|oauth2):)?([^@/]+)@/i)?.[1]
  if (tok) {
    const { useSettingsStore } = await import('../stores/settings')
    await useSettingsStore().saveToken(tok)
  }
  toast.success('远程地址已保存到此工作区')
}

async function ensureTabCryptoSession(): Promise<boolean> {
  if (!tab.value) return false
  if (workspace.activeId !== tab.value.id) {
    await workspace.switchTab(tab.value.id)
  }
  if (tabHasOwnCrypto(tab.value)) {
    if (!workspace.activeTabCryptoReady) {
      toast.error('请先解锁此工作区的加密密码')
      return false
    }
  }
  if (!(await api.lock.sessionReady())) {
    toast.error('请先解锁笔记加密密码')
    return false
  }
  return true
}

async function applyRemote() {
  if (!tab.value) return
  const url = remoteUrl.value.trim()
  if (!url) {
    toast.error('请填写完整 Git 地址')
    return
  }
  if (!(await ensureTabCryptoSession())) return
  const root = workspace.root
  if (!root) {
    toast.error('工作区路径无效')
    return
  }
  busy.value = true
  try {
    try {
      await api.git.status(root)
    } catch {
      await api.git.init(root)
    }
    await api.git.setRemote(root, url)
    await workspace.updateTabRemote(tab.value.id, url)
    toast.success(`已设为 origin：${maskedRemote.value}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function loadOrigin() {
  if (!tab.value) return
  if (workspace.activeId !== tab.value.id) {
    await workspace.switchTab(tab.value.id)
  }
  const root = workspace.root
  if (!root) {
    toast.error('工作区路径无效')
    return
  }
  try {
    const url = await api.git.getRemote(root)
    if (url) {
      remoteUrl.value = url
      await workspace.updateTabRemote(tab.value.id, url)
      toast.success('已读取当前 origin')
    } else {
      toast.info('当前仓库尚未设置 origin')
    }
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function cloneFromRemote() {
  const url = remoteUrl.value.trim()
  if (!url) {
    toast.error('请填写完整 Git 地址')
    return
  }
  const destParent = asPath(
    await pickDirectory({
      directory: true,
      multiple: false,
      title: '选择克隆目标父目录',
    }),
  )
  if (!destParent) return
  const leaf =
    url
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/.*@/, '') || 'notes'
  const sep = destParent.includes('\\') ? '\\' : '/'
  const target = destParent.replace(/[/\\]$/, '') + sep + leaf
  busy.value = true
  try {
    await api.git.clone(url, target)
    const tabName = name.value.trim() || leaf
    await workspace.openWorkspace(target, tabName)
    if (workspace.activeId) {
      await workspace.updateTabRemote(workspace.activeId, url)
    }
    toast.success(`已克隆并打开：${tabName}`)
    onClose()
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function copyRemote() {
  if (!remoteUrl.value.trim()) return
  try {
    await writeText(remoteUrl.value.trim())
    toast.success('已复制')
  } catch {
    toast.error('复制失败')
  }
}

function asPath(selected: string | string[] | null): string | null {
  if (typeof selected === 'string' && selected) return selected
  if (Array.isArray(selected) && selected[0]) return selected[0]
  return null
}

async function changePath() {
  if (!tab.value) return
  const selected = await pickDirectory({ directory: true, multiple: false })
  const path = asPath(selected)
  if (!path) return
  await workspace.updateTabPath(tab.value.id, path)
  toast.success('本地路径已更新')
}

async function saveCryptoPassword() {
  if (!tab.value) return
  if (hasOwnCrypto.value && !cryptoCurrent.value) {
    toast.error('请输入当前加密密码')
    return
  }
  if (cryptoPwd.value.length < 4) {
    toast.error('新加密密码至少 4 个字符')
    return
  }
  if (cryptoPwd.value !== cryptoPwd2.value) {
    toast.error('两次输入的新加密密码不一致')
    return
  }
  cryptoBusy.value = true
  try {
    await workspace.setTabCryptoPassword(
      tab.value.id,
      cryptoCurrent.value,
      cryptoPwd.value,
    )
    cryptoCurrent.value = ''
    cryptoPwd.value = ''
    cryptoPwd2.value = ''
    toast.success(
      tab.value.path
        ? '此工作区加密密码已保存，笔记已用新密钥重加密'
        : '此工作区加密密码已保存',
    )
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cryptoBusy.value = false
  }
}

async function clearOwnCrypto() {
  if (!tab.value || !hasOwnCrypto.value) return
  await workspace.clearTabOwnCrypto(tab.value.id)
  toast.success('已清除此工作区加密密码配置（需重新设置后才能读写加密笔记）')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open && tab" class="mask" @mousedown.self="onClose">
      <div class="dialog stack" role="dialog" aria-modal="true" @mousedown.stop>
        <div class="dialog-head row">
          <h2>工作区设置</h2>
          <button type="button" class="icon-close" aria-label="关闭" @click="onClose">×</button>
        </div>

        <section class="stack section">
          <h3>Tab 名称</h3>
          <p class="muted tip">显示在顶部工作区 Tab 上，可自定义。</p>
          <div class="row">
            <input v-model="name" type="text" placeholder="例如：工作笔记" />
            <button type="button" class="primary" @click="saveName">保存名称</button>
          </div>
          <p class="muted path">{{ tab.path || '尚未绑定本地目录' }}</p>
          <button type="button" @click="changePath">更换本地目录…</button>
        </section>

        <section class="stack section">
          <h3>笔记加密密码</h3>
          <p class="muted tip">
            此工作区的笔记加密密码（与其他 Tab、启动锁均无关）。当前：
            <strong>{{ hasOwnCrypto ? '已设置' : '未设置' }}</strong>
          </p>
          <label v-if="hasOwnCrypto" class="stack">
            <span class="muted">当前加密密码</span>
            <input v-model="cryptoCurrent" type="password" autocomplete="off" />
          </label>
          <label v-else class="stack">
            <span class="muted">原加密密码（笔记已加密时必填；全新目录可留空）</span>
            <input v-model="cryptoCurrent" type="password" autocomplete="off" />
          </label>
          <label class="stack">
            <span class="muted">新加密密码</span>
            <input v-model="cryptoPwd" type="password" autocomplete="new-password" />
          </label>
          <label class="stack">
            <span class="muted">确认新加密密码</span>
            <input v-model="cryptoPwd2" type="password" autocomplete="new-password" />
          </label>
          <div class="row wrap">
            <button
              type="button"
              class="primary"
              :disabled="cryptoBusy || !cryptoPwd || !cryptoPwd2 || (hasOwnCrypto && !cryptoCurrent)"
              @click="saveCryptoPassword"
            >
              {{ hasOwnCrypto ? '修改此工作区加密密码' : '为此工作区设置加密密码' }}
            </button>
            <button
              v-if="hasOwnCrypto"
              type="button"
              :disabled="cryptoBusy"
              @click="clearOwnCrypto"
            >
              清除密码配置
            </button>
          </div>
        </section>

        <section class="stack section">
          <h3>Git 远程</h3>
          <p class="muted tip">
            填写完整地址即可，例如
            <code>https://x-access-token:&lt;TOKEN&gt;@github.com/owner/repo.git</code>
            或 Gitee
            <code>https://oauth2:&lt;TOKEN&gt;@gitee.com/owner/repo.git</code>
          </p>
          <label class="stack">
            <span class="muted">完整仓库地址</span>
            <input
              v-model="remoteUrl"
              type="password"
              placeholder="https://x-access-token:&lt;TOKEN&gt;@github.com/owner/repo.git"
              autocomplete="off"
              spellcheck="false"
            />
            <p v-if="remoteUrl" class="muted preview">{{ maskedRemote }}</p>
          </label>
          <div class="row wrap">
            <button type="button" class="primary" :disabled="busy" @click="saveRemote">
              保存地址
            </button>
            <button
              type="button"
              :disabled="busy || !remoteUrl.trim()"
              @click="applyRemote"
            >
              设为当前 origin
            </button>
            <button type="button" :disabled="busy" @click="loadOrigin">读取 origin</button>
            <button
              type="button"
              :disabled="busy || !remoteUrl.trim()"
              @click="cloneFromRemote"
            >
              克隆此地址
            </button>
            <button type="button" :disabled="!remoteUrl.trim()" @click="copyRemote">复制</button>
          </div>
        </section>

        <button type="button" class="primary" @click="onClose">完成</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 35%);
  display: grid;
  place-items: center;
  z-index: 210;
  padding: 1rem;
}
.dialog {
  width: min(520px, 96vw);
  max-height: min(90vh, 720px);
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1.1rem 1.2rem 1.2rem;
  box-shadow: var(--shadow);
}
.dialog-head {
  justify-content: space-between;
  align-items: center;
}
.icon-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0.15rem 0.45rem;
  color: var(--muted);
}
h2 {
  margin: 0;
  font-size: 1.1rem;
  font-family: var(--font-mono);
  letter-spacing: 0.04em;
}
h3 {
  margin: 0;
  font-size: 0.72rem;
  font-family: var(--font-mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent);
}
.section {
  padding-top: 0.45rem;
  border-top: 1px solid var(--border);
}
.tip {
  font-size: 0.8rem;
  margin: 0;
}
.tip code {
  font-size: 0.75rem;
  color: var(--accent);
}
.path {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  word-break: break-all;
  margin: 0;
}
.preview {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  margin: 0;
}
.wrap {
  flex-wrap: wrap;
}
</style>
