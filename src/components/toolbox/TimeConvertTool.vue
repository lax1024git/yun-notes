<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useToastStore } from '../../stores/toast'
import {
  TIME_ZONES,
  detectLocalTimeZone,
  formatDateTimeInZone,
  formatTimestamp,
  parseDateTimeInZone,
  parseTimestampInput,
  type TimestampUnit,
} from '../../utils/time-convert'

const toast = useToastStore()

const localTz = detectLocalTimeZone()
const zones = computed(() => {
  const list = [...TIME_ZONES]
  if (!list.some((z) => z.id === localTz)) {
    list.unshift({ id: localTz, label: `本地 (${localTz})` })
  }
  return list
})

const timeZone = ref(
  TIME_ZONES.some((z) => z.id === localTz) ? localTz : 'Asia/Shanghai',
)
const unit = ref<TimestampUnit>('s')

const tsInput = ref('')
const dtInput = ref('')
const error = ref('')

function fillNow() {
  const ms = Date.now()
  tsInput.value = formatTimestamp(ms, unit.value)
  try {
    dtInput.value = formatDateTimeInZone(ms, timeZone.value)
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function tsToDate() {
  error.value = ''
  const ms = parseTimestampInput(tsInput.value)
  if (ms == null) {
    error.value = '请输入有效时间戳（秒或毫秒）'
    return
  }
  try {
    dtInput.value = formatDateTimeInZone(ms, timeZone.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function dateToTs() {
  error.value = ''
  try {
    const ms = parseDateTimeInZone(dtInput.value, timeZone.value)
    tsInput.value = formatTimestamp(ms, unit.value)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

watch(unit, () => {
  const ms = parseTimestampInput(tsInput.value)
  if (ms != null) tsInput.value = formatTimestamp(ms, unit.value)
})

watch(timeZone, () => {
  const ms = parseTimestampInput(tsInput.value)
  if (ms != null) {
    try {
      dtInput.value = formatDateTimeInZone(ms, timeZone.value)
      error.value = ''
    } catch {
      /* keep */
    }
  }
})

async function copy(text: string) {
  if (!text) return
  try {
    await writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败')
  }
}

fillNow()
</script>

<template>
  <div class="time-tool stack">
    <label class="field">
      <span class="muted">时区</span>
      <select v-model="timeZone">
        <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.label }}</option>
      </select>
    </label>

    <label class="field">
      <span class="muted">时间戳单位</span>
      <select v-model="unit">
        <option value="s">秒（10 位）</option>
        <option value="ms">毫秒（13 位）</option>
      </select>
    </label>

    <label class="field">
      <span class="muted">时间戳</span>
      <div class="row">
        <input
          v-model="tsInput"
          type="text"
          inputmode="numeric"
          placeholder="例如 1780000000"
          @keydown.enter.prevent="tsToDate"
        />
        <button type="button" title="复制" @click="copy(tsInput)">复制</button>
      </div>
    </label>

    <div class="row actions">
      <button type="button" class="primary" @click="tsToDate">时间戳 → 时间</button>
      <button type="button" class="primary" @click="dateToTs">时间 → 时间戳</button>
      <button type="button" @click="fillNow">现在</button>
    </div>

    <label class="field">
      <span class="muted">日期时间（YYYY-MM-DD HH:mm:ss）</span>
      <div class="row">
        <input
          v-model="dtInput"
          type="text"
          placeholder="2026-09-22 16:49:54"
          @keydown.enter.prevent="dateToTs"
        />
        <button type="button" title="复制" @click="copy(dtInput)">复制</button>
      </div>
    </label>

    <p v-if="error" class="err">{{ error }}</p>
  </div>
</template>

<style scoped>
.time-tool {
  gap: 0.65rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.field span {
  font-size: 0.8rem;
}
.row {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.row input,
.field select {
  flex: 1;
  min-width: 0;
}
.actions {
  flex-wrap: wrap;
}
.err {
  margin: 0;
  color: var(--danger);
  font-size: 0.85rem;
}
</style>
