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
      <h1>Note Workstation</h1>
      <p class="muted">已启用密码锁，请输入密码后继续</p>
      <label class="stack">
        <span class="muted">启动密码</span>
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
      <button type="submit" class="primary" :disabled="busy">解锁</button>
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
  background:
    radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 55%),
    var(--bg);
}
.card {
  width: min(380px, 100%);
  padding: 1.5rem 1.4rem;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  box-shadow: 0 16px 40px rgb(0 0 0 / 18%);
}
h1 {
  margin: 0;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}
.hint {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.4;
}
</style>
