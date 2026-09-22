<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { api, errorMessage } from '../api/tauri'
import type { ThemeMode } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'

const visible = defineModel<boolean>('open', { default: false })

const settings = useSettingsStore()
const toast = useToastStore()
const workspace = useWorkspaceStore()

const remoteUrl = ref('')
const busy = ref(false)

const lockPwd = ref('')
const lockPwd2 = ref('')
const lockCurrent = ref('')
const lockBusy = ref(false)

const cryptoCurrent = ref('')
const cryptoPwd = ref('')
const cryptoPwd2 = ref('')
const cryptoBusy = ref(false)

watch(
  () => [visible.value, settings.ready] as const,
  ([isOpen, ready]) => {
    if (!isOpen || !ready) return
    remoteUrl.value = settings.remoteUrl
    lockPwd.value = ''
    lockPwd2.value = ''
    lockCurrent.value = ''
    cryptoCurrent.value = ''
    cryptoPwd.value = ''
    cryptoPwd2.value = ''
  },
  { immediate: true },
)

const maskedRemote = computed(() =>
  remoteUrl.value
    .replace(/oauth2:[^@/]+@/i, 'oauth2:****@')
    .replace(/\/\/([^/@]+)@/, '//****@'),
)

function extractTokenFromUrl(url: string): string | null {
  const m = url.match(/https?:\/\/(?:oauth2:)?([^@/]+)@/i)
  return m?.[1] || null
}

function leafNameFromUrl(url: string): string {
  return (
    url
      .replace(/\.git$/i, '')
      .split('/')
      .filter(Boolean)
      .pop()
      ?.replace(/.*@/, '') || 'notes'
  )
}

function onTheme(e: Event) {
  void settings.setTheme((e.target as HTMLSelectElement).value as ThemeMode)
}

async function persistRemote() {
  const url = remoteUrl.value.trim()
  await settings.saveRemoteUrl(url)
  const tok = extractTokenFromUrl(url)
  if (tok) await settings.saveToken(tok)
}

async function loadCurrentOrigin() {
  if (!workspace.root) {
    toast.error('请先打开工作区')
    return
  }
  try {
    const url = await api.git.getRemote(workspace.root)
    if (url) {
      remoteUrl.value = url
      await persistRemote()
      toast.success('已读取当前 origin')
    } else {
      toast.info('当前仓库尚未设置 origin')
    }
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function applyRemoteToWorkspace() {
  const url = remoteUrl.value.trim()
  if (!url) {
    toast.error('请填写完整 Git 地址')
    return
  }
  if (!workspace.root) {
    toast.error('请先打开工作区')
    return
  }
  if (!(await api.lock.sessionReady())) {
    toast.error('请先解锁笔记加密密码')
    return
  }
  busy.value = true
  try {
    try {
      await api.git.status(workspace.root)
    } catch {
      await api.git.init(workspace.root)
    }
    await api.git.setRemote(workspace.root, url)
    await persistRemote()
    toast.success(`已设为 origin：${maskedRemote.value}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function cloneFromRemote() {
  const url = remoteUrl.value.trim()
  if (!url) {
    toast.error('请填写完整 Git 地址')
    return
  }
  if (!(await api.lock.sessionReady())) {
    toast.error('请先解锁笔记加密密码后再克隆')
    return
  }
  const parent = await pickDirectory({ directory: true, multiple: false })
  if (typeof parent !== 'string') return
  const leaf = leafNameFromUrl(url)
  const dest =
    parent.endsWith('\\') || parent.endsWith('/')
      ? `${parent}${leaf}`
      : `${parent}\\${leaf}`
  busy.value = true
  try {
    await api.git.clone(url, dest)
    await persistRemote()
    toast.success('克隆完成（密文仓库，打开笔记时解密）')
    if (window.confirm('是否打开为当前工作区？')) {
      await workspace.openWorkspace(dest)
    }
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

async function copyRemote() {
  const url = remoteUrl.value.trim()
  if (!url) {
    toast.error('没有可复制的地址')
    return
  }
  await persistRemote()
  try {
    await writeText(url)
    toast.success(`已复制：${maskedRemote.value}`)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

async function exportDecrypted() {
  if (!workspace.root) {
    toast.error('请先打开工作区')
    return
  }
  if (!(await api.lock.sessionReady())) {
    toast.error('请先解锁笔记加密密码后再导出')
    return
  }
  const dest = await pickDirectory({
    directory: true,
    multiple: false,
    title: '选择解密导出目录',
  })
  if (typeof dest !== 'string') return
  busy.value = true
  try {
    const n = await api.fs.exportDecrypted(workspace.root, dest)
    toast.success(`已导出 ${n} 个文件到：${dest}`)
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    busy.value = false
  }
}

function onClose() {
  visible.value = false
  void persistRemote().catch((e) => toast.error(errorMessage(e)))
}

async function enableAppLock() {
  if (lockPwd.value.length < 4) {
    toast.error('密码至少 4 个字符')
    return
  }
  if (lockPwd.value !== lockPwd2.value) {
    toast.error('两次输入的密码不一致')
    return
  }
  lockBusy.value = true
  try {
    await settings.enableLock(lockPwd.value)
    lockPwd.value = ''
    lockPwd2.value = ''
    toast.success('已启用密码锁')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    lockBusy.value = false
  }
}

async function changeAppLock() {
  if (!lockCurrent.value) {
    toast.error('请输入当前启动密码')
    return
  }
  if (lockPwd.value.length < 4) {
    toast.error('新密码至少 4 个字符')
    return
  }
  if (lockPwd.value !== lockPwd2.value) {
    toast.error('两次输入的新密码不一致')
    return
  }
  lockBusy.value = true
  try {
    const wsRoot = workspace.root
    const shared = !settings.cryptoConfigured
    await settings.changeLockPassword(lockCurrent.value, lockPwd.value, wsRoot)
    lockCurrent.value = ''
    lockPwd.value = ''
    lockPwd2.value = ''
    toast.success(
      shared && wsRoot
        ? '启动密码已修改（仍与加密共用，笔记已重加密）'
        : '启动密码已修改',
    )
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    lockBusy.value = false
  }
}

async function disableAppLock() {
  if (!lockCurrent.value) {
    toast.error('请输入当前启动密码以关闭密码锁')
    return
  }
  lockBusy.value = true
  try {
    await settings.disableLock(lockCurrent.value)
    lockCurrent.value = ''
    lockPwd.value = ''
    lockPwd2.value = ''
    toast.success(
      settings.cryptoConfigured
        ? '已关闭启动密码锁（笔记加密密码仍有效）'
        : '已关闭启动密码锁',
    )
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    lockBusy.value = false
  }
}

async function saveCryptoPassword() {
  if (!cryptoCurrent.value) {
    toast.error('请输入当前加密密码（未独立设置时即为启动密码）')
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
    await settings.setCryptoPassword(
      cryptoCurrent.value,
      cryptoPwd.value,
      workspace.root,
    )
    cryptoCurrent.value = ''
    cryptoPwd.value = ''
    cryptoPwd2.value = ''
    toast.success(
      workspace.root
        ? '加密密码已独立设置，笔记已用新密钥重加密'
        : '加密密码已独立设置',
    )
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cryptoBusy.value = false
  }
}

async function rebindCryptoToUnlock() {
  if (!lockCurrent.value && !cryptoCurrent.value) {
    toast.error('请输入启动密码以恢复共用')
    return
  }
  const pwd = lockCurrent.value || cryptoCurrent.value
  cryptoBusy.value = true
  try {
    await settings.bindCryptoToUnlock(pwd, workspace.root)
    lockCurrent.value = ''
    cryptoCurrent.value = ''
    cryptoPwd.value = ''
    cryptoPwd2.value = ''
    toast.success(
      workspace.root
        ? '已改回与启动密码共用，笔记已重加密'
        : '已改回与启动密码共用',
    )
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    cryptoBusy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="mask" @mousedown.self="onClose">
      <div class="dialog stack" role="dialog" aria-modal="true" @mousedown.stop>
        <div class="dialog-head row">
          <h2>设置</h2>
          <button type="button" class="icon-close" aria-label="关闭" @click="onClose">×</button>
        </div>

        <section class="stack section">
          <h3>外观</h3>
          <label class="stack">
            <span class="muted">主题</span>
            <select :value="settings.theme" @change="onTheme">
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </section>

        <section class="stack section">
          <h3>启动密码锁</h3>
          <p class="muted tip">
            仅用于启动时进入应用，与笔记加密密码可分开。未单独设置加密密码时，启动密码仍会兼作加密密码。
          </p>
          <template v-if="!settings.lockEnabled">
            <label class="stack">
              <span class="muted">设置启动密码</span>
              <input v-model="lockPwd" type="password" autocomplete="new-password" />
            </label>
            <label class="stack">
              <span class="muted">确认密码</span>
              <input v-model="lockPwd2" type="password" autocomplete="new-password" />
            </label>
            <button
              type="button"
              class="primary"
              :disabled="lockBusy || !lockPwd || !lockPwd2"
              @click="enableAppLock"
            >
              启用启动密码锁
            </button>
          </template>
          <template v-else>
            <p class="muted status">状态：已启用</p>
            <label class="stack">
              <span class="muted">当前启动密码</span>
              <input v-model="lockCurrent" type="password" autocomplete="current-password" />
            </label>
            <label class="stack">
              <span class="muted">新启动密码（修改时填写）</span>
              <input v-model="lockPwd" type="password" autocomplete="new-password" />
            </label>
            <label class="stack">
              <span class="muted">确认新启动密码</span>
              <input v-model="lockPwd2" type="password" autocomplete="new-password" />
            </label>
            <div class="row wrap">
              <button
                type="button"
                class="primary"
                :disabled="lockBusy || !lockCurrent || !lockPwd || !lockPwd2"
                @click="changeAppLock"
              >
                修改启动密码
              </button>
              <button type="button" :disabled="lockBusy || !lockCurrent" @click="disableAppLock">
                关闭启动锁
              </button>
            </div>
          </template>
        </section>

        <section class="stack section">
          <h3>笔记加密密码</h3>
          <p class="muted tip">
            用于磁盘笔记加解密。当前：
            <strong>{{
              settings.cryptoConfigured ? '已独立于启动密码' : '与启动密码共用'
            }}</strong>
            。独立设置后，修改启动密码不会改笔记密钥。
          </p>
          <label class="stack">
            <span class="muted">当前加密密码（共用时填启动密码）</span>
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
              :disabled="cryptoBusy || !cryptoCurrent || !cryptoPwd || !cryptoPwd2"
              @click="saveCryptoPassword"
            >
              {{ settings.cryptoConfigured ? '修改加密密码' : '设置为独立加密密码' }}
            </button>
            <button
              v-if="settings.cryptoConfigured && settings.lockEnabled"
              type="button"
              :disabled="cryptoBusy || !(lockCurrent || cryptoCurrent)"
              @click="rebindCryptoToUnlock"
            >
              改回与启动密码共用
            </button>
          </div>
        </section>

        <section class="stack section">
          <h3>导出明文</h3>
          <p class="muted tip">
            将工作区笔记解密后导出到指定目录（保留相对路径；非笔记文件原样复制）。
          </p>
          <button
            type="button"
            class="primary"
            :disabled="busy || !workspace.root"
            @click="exportDecrypted"
          >
            选择目录并导出
          </button>
        </section>

        <section class="stack section">
          <h3>Git 远程</h3>
          <p class="muted tip">
            填写完整地址即可，例如
            <code>https://oauth2:&lt;TOKEN&gt;@gitee.com/owner/repo.git</code>
          </p>
          <label class="stack">
            <span class="muted">完整仓库地址</span>
            <input
              v-model="remoteUrl"
              type="password"
              placeholder="https://oauth2:&lt;TOKEN&gt;@gitee.com/owner/repo.git"
              autocomplete="off"
              spellcheck="false"
            />
            <p v-if="remoteUrl" class="muted preview">{{ maskedRemote }}</p>
          </label>
          <div class="row wrap">
            <button
              type="button"
              class="primary"
              :disabled="busy || !remoteUrl.trim()"
              @click="cloneFromRemote"
            >
              克隆此地址
            </button>
            <button
              type="button"
              :disabled="busy || !remoteUrl.trim()"
              @click="applyRemoteToWorkspace"
            >
              设为当前 origin
            </button>
            <button type="button" :disabled="!workspace.root" @click="loadCurrentOrigin">
              读取当前 origin
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
  z-index: 200;
  padding: 1rem;
}
.dialog {
  width: min(520px, 96vw);
  max-height: min(90vh, 820px);
  overflow: auto;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 12px;
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
  border-radius: 6px;
}
.icon-close:hover {
  background: var(--accent-soft);
  color: var(--text);
}
h2 {
  margin: 0;
  font-size: 1.15rem;
}
h3 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.section {
  padding-top: 0.35rem;
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
.preview {
  font-size: 0.75rem;
  word-break: break-all;
  margin: 0;
}
.wrap {
  flex-wrap: wrap;
}
.status {
  margin: 0;
  font-size: 0.85rem;
}
</style>
