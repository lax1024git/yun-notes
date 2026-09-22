<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { errorMessage } from '../api/tauri'
import { tabHasOwnCrypto, useWorkspaceStore } from '../stores/workspace'

const workspace = useWorkspaceStore()

const password = ref('')
const password2 = ref('')
const currentPassword = ref('')
const error = ref('')
const busy = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const tab = computed(() => workspace.pendingCryptoUnlockTab)
const open = computed(() => !!tab.value)
const isSetup = computed(() => !!tab.value && !tabHasOwnCrypto(tab.value))

watch(open, async (v) => {
  if (!v) return
  password.value = ''
  password2.value = ''
  currentPassword.value = ''
  error.value = ''
  await nextTick(() => inputRef.value?.focus())
})

function onClose() {
  if (busy.value) return
  workspace.dismissPendingCrypto()
  password.value = ''
  password2.value = ''
  currentPassword.value = ''
  error.value = ''
}

async function submit() {
  if (!tab.value || busy.value) return
  error.value = ''

  if (isSetup.value) {
    if (password.value.length < 4) {
      error.value = '加密密码至少 4 个字符'
      return
    }
    if (password.value !== password2.value) {
      error.value = '两次输入的密码不一致'
      return
    }
    busy.value = true
    try {
      await workspace.setTabCryptoPassword(
        tab.value.id,
        currentPassword.value,
        password.value,
      )
      password.value = ''
      password2.value = ''
      currentPassword.value = ''
    } catch (e) {
      error.value = errorMessage(e)
    } finally {
      busy.value = false
    }
    return
  }

  if (!password.value) {
    error.value = '请输入此工作区的加密密码'
    return
  }
  busy.value = true
  try {
    const ok = await workspace.unlockTabCrypto(tab.value.id, password.value)
    if (!ok) {
      error.value = '加密密码错误'
      password.value = ''
      await nextTick(() => inputRef.value?.focus())
      return
    }
    password.value = ''
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && tab"
      class="mask"
      role="dialog"
      aria-modal="true"
      @mousedown.self="onClose"
    >
      <form class="card stack" @submit.prevent="submit" @mousedown.stop>
        <div class="dialog-head row">
          <div>
            <div class="eyebrow">WORKSPACE CRYPTO</div>
            <h2>{{ isSetup ? '设置工作区加密密码' : '解锁工作区加密' }}</h2>
          </div>
          <button
            type="button"
            class="icon-close"
            aria-label="关闭"
            :disabled="busy"
            @click="onClose"
          >
            ×
          </button>
        </div>
        <p class="muted">
          <template v-if="isSetup">
            「{{ tab.name }}」尚未绑定笔记加密密码。若目录里已有加密笔记，请在「原加密密码」填入当初加密时的密码（与启动密码锁无关）。
          </template>
          <template v-else>
            「{{ tab.name }}」的笔记加密密码与启动锁无关，请输入此工作区的加密密码。
          </template>
        </p>

        <label v-if="isSetup" class="stack">
          <span class="tech-label">原加密密码（已有加密笔记时必填；全新空目录可留空）</span>
          <input
            v-model="currentPassword"
            type="password"
            autocomplete="off"
            :disabled="busy"
          />
        </label>

        <label class="stack">
          <span class="tech-label">{{ isSetup ? '新加密密码' : '加密密码' }}</span>
          <input
            ref="inputRef"
            v-model="password"
            type="password"
            autocomplete="off"
            :placeholder="isSetup ? '至少 4 个字符' : '此 Tab 的笔记加密密码'"
            :disabled="busy"
          />
        </label>

        <label v-if="isSetup" class="stack">
          <span class="tech-label">确认加密密码</span>
          <input
            v-model="password2"
            type="password"
            autocomplete="new-password"
            :disabled="busy"
          />
        </label>

        <p v-if="error" class="err">{{ error }}</p>
        <div class="row wrap">
          <button type="submit" class="primary" :disabled="busy">
            {{ isSetup ? '保存并启用加密' : '解锁此工作区' }}
          </button>
          <button type="button" :disabled="busy" @click="onClose">关闭</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 220;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 45%);
}
.card {
  width: min(400px, 96vw);
  padding: 1.25rem 1.2rem;
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: var(--shadow);
}
.dialog-head {
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}
.icon-close {
  border: none;
  background: transparent;
  font-size: 1.4rem;
  line-height: 1;
  padding: 0.15rem 0.45rem;
  color: var(--muted);
  flex-shrink: 0;
}
.icon-close:hover {
  color: var(--text);
}
.eyebrow {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  color: var(--accent);
}
h2 {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  font-family: var(--font-mono);
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
.tech-label {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.wrap {
  flex-wrap: wrap;
}
</style>
