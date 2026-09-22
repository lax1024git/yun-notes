<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { errorMessage } from '../api/tauri'
import { useSettingsStore } from '../stores/settings'

const emit = defineEmits<{ unlocked: [] }>()

const settings = useSettingsStore()
const password = ref('')
const error = ref('')
const busy = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  void nextTick(() => inputRef.value?.focus())
})

async function submit() {
  if (busy.value) return
  error.value = ''
  const pwd = password.value
  if (!pwd) {
    error.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    const ok = await settings.unlock(pwd)
    if (!ok) {
      error.value = '密码错误'
      password.value = ''
      await nextTick(() => inputRef.value?.focus())
      return
    }
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
        <div>
          <div class="eyebrow">SECURE ACCESS</div>
          <h1>LAX TOOLS</h1>
        </div>
      </div>
      <p class="muted">已启用密码锁，请输入密码后继续</p>
      <label class="stack">
        <span class="tech-label">Auth Key</span>
        <input
          ref="inputRef"
          v-model="password"
          type="password"
          autocomplete="current-password"
          placeholder="输入密码"
          :disabled="busy"
        />
      </label>
      <p v-if="error" class="err">{{ error }}</p>
      <button type="submit" class="primary" :disabled="busy">解锁进入</button>
      <p class="muted hint">忘记密码需手动清除应用配置中的密码锁字段</p>
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
</style>
