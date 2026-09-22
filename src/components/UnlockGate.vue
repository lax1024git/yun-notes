<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { errorMessage } from '../api/tauri'
import { useSettingsStore } from '../stores/settings'
import { useWorkspaceStore } from '../stores/workspace'

const emit = defineEmits<{ unlocked: [] }>()

const settings = useSettingsStore()
const workspace = useWorkspaceStore()
const password = ref('')
const error = ref('')
const busy = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  void nextTick(() => inputRef.value?.focus())
})

async function onClose() {
  if (busy.value) return
  try {
    await getCurrentWindow().close()
  } catch {
    /* ignore */
  }
}

async function submit() {
  if (busy.value) return
  error.value = ''

  if (!password.value) {
    error.value = '请输入启动密码'
    return
  }

  busy.value = true
  try {
    const ok = await settings.unlock(password.value)
    if (!ok) {
      error.value = '密码错误'
      password.value = ''
      await nextTick(() => inputRef.value?.focus())
      return
    }
    await workspace.loadTabs()
    await workspace.seedSharedCryptoFromUnlock(password.value)
    password.value = ''
    emit('unlocked')
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="unlock-gate">
    <form class="card stack" @submit.prevent="submit">
      <div class="card-top">
        <span class="mark" aria-hidden="true" />
        <div class="grow">
          <div class="eyebrow">SECURE ACCESS</div>
          <h1>LAX1024 TOOLS</h1>
        </div>
        <button type="button" class="icon-close" aria-label="关闭" :disabled="busy" @click="onClose">
          ×
        </button>
      </div>

      <p class="muted">已启用启动密码锁。笔记加密密码与启动锁分开，在各工作区 Tab 中单独设置。</p>

      <label class="stack">
        <span class="tech-label">启动密码</span>
        <input
          ref="inputRef"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="启动密码锁"
          :disabled="busy"
        />
      </label>

      <p v-if="error" class="err">{{ error }}</p>
      <div class="row wrap">
        <button type="submit" class="primary" :disabled="busy">解锁进入</button>
        <button type="button" :disabled="busy" @click="onClose">关闭</button>
      </div>
      <p class="muted hint">忘记密码需手动清除应用配置中的相关字段</p>
    </form>
  </div>
</template>

<style scoped>
.unlock-gate {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: grid;
  place-items: center;
  padding: 1.5rem;
  background-color: var(--bg);
  background-image:
    linear-gradient(var(--grid-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),
    radial-gradient(ellipse at 30% 20%, var(--panel-glow), transparent 55%);
  background-size:
    24px 24px,
    24px 24px,
    auto;
}
.card {
  position: relative;
  width: min(400px, 100%);
  padding: 1.45rem 1.35rem 1.25rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
}
.card-top {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.grow {
  flex: 1;
  min-width: 0;
}
.icon-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0.15rem 0.45rem;
  color: var(--muted);
}
.icon-close:hover {
  color: var(--text);
}
.mark {
  width: 12px;
  height: 12px;
  border: 2px solid var(--accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
}
.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  color: var(--accent);
}
h1 {
  margin: 0.15rem 0 0;
  font-family: var(--font-mono);
  font-size: 1.25rem;
  letter-spacing: 0.1em;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
.hint {
  font-size: 0.75rem;
  margin: 0;
}
.wrap {
  flex-wrap: wrap;
}
</style>
