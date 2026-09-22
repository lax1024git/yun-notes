<script setup lang="ts">
import { ref, watch } from 'vue'
import { open as pickDirectory } from '@tauri-apps/plugin-dialog'
import { api, errorMessage } from '../api/tauri'
import type { ThemeMode } from '../types'
import { useSettingsStore } from '../stores/settings'
import { useToastStore } from '../stores/toast'
import { useWorkspaceStore } from '../stores/workspace'

const visible = defineModel<boolean>('open', { default: false })

const settings = useSettingsStore()
const toast = useToastStore()
const workspace = useWorkspaceStore()

const busy = ref(false)

const lockPwd = ref('')
const lockPwd2 = ref('')
const lockCurrent = ref('')
const lockBusy = ref(false)

watch(
  () => [visible.value, settings.ready] as const,
  ([isOpen, ready]) => {
    if (!isOpen || !ready) return
    lockPwd.value = ''
    lockPwd2.value = ''
    lockCurrent.value = ''
  },
  { immediate: true },
)

function onTheme(e: Event) {
  void settings.setTheme((e.target as HTMLSelectElement).value as ThemeMode)
}

async function exportDecrypted() {
  if (!workspace.root) {
    toast.error('请先打开工作区')
    return
  }
  if (!workspace.activeTabCryptoReady || !(await api.lock.sessionReady())) {
    toast.error('请先解锁当前工作区的笔记加密密码后再导出')
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
    toast.success('已启用启动密码锁')
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
    await settings.changeLockPassword(lockCurrent.value, lockPwd.value)
    lockCurrent.value = ''
    lockPwd.value = ''
    lockPwd2.value = ''
    toast.success('启动密码已修改')
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
    toast.success('已关闭启动密码锁')
  } catch (e) {
    toast.error(errorMessage(e))
  } finally {
    lockBusy.value = false
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
            仅用于启动时进入应用，与笔记文件加密无关。每个工作区的加密密码请在 Tab「工作区设置」中单独配置。
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
          <h3>笔记加密</h3>
          <p class="muted tip">
            文件加密密码按工作区 Tab 独立设置，无全局加密密码。点击顶部 Tab 右侧
            <strong>···</strong> 打开「工作区设置」进行配置。
          </p>
        </section>

        <section class="stack section">
          <h3>导出明文</h3>
          <p class="muted tip">
            将当前工作区笔记解密后导出到指定目录（保留相对路径；非笔记文件原样复制）。
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
            每个工作区可单独配置 Git 地址。请点击顶部工作区 Tab 右侧的
            <strong>···</strong> 打开「工作区设置」。
          </p>
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
.wrap {
  flex-wrap: wrap;
}
.status {
  margin: 0;
  font-size: 0.85rem;
}
</style>
