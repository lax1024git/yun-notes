<script setup lang="ts">
import { ref } from 'vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useToastStore } from '../../stores/toast'
import {
  chineseToUnicode,
  escapeJson,
  formatJson,
  minifyJson,
  unescapeJson,
  unicodeToChinese,
} from '../../utils/json-tool'

const toast = useToastStore()
const text = ref('')
const status = ref('')
const statusOk = ref(true)

function setOk(msg: string) {
  statusOk.value = true
  status.value = msg
}

function setErr(msg: string) {
  statusOk.value = false
  status.value = msg
}

function run(fn: () => string, okMsg: string) {
  try {
    text.value = fn()
    setOk(okMsg)
  } catch (e) {
    setErr(e instanceof Error ? e.message : String(e))
  }
}

function onFormat() {
  run(() => formatJson(text.value), '校验通过，已格式化')
}

function onMinify() {
  run(() => minifyJson(text.value), '已压缩')
}

function onEscape() {
  run(() => escapeJson(text.value), '已转义')
}

function onUnescape() {
  run(() => unescapeJson(text.value), '已去转义')
}

function onUnicodeToCn() {
  run(() => unicodeToChinese(text.value), '已转为中文')
}

function onCnToUnicode() {
  run(() => chineseToUnicode(text.value), '已转为 Unicode')
}

function onClear() {
  text.value = ''
  status.value = ''
}

async function onCopy() {
  if (!text.value) {
    setErr('没有可复制的内容')
    return
  }
  try {
    await writeText(text.value)
    toast.success('已复制')
    setOk('已复制到剪贴板')
  } catch {
    setErr('复制失败')
  }
}
</script>

<template>
  <div class="json-tool">
    <textarea
      v-model="text"
      class="editor"
      spellcheck="false"
      placeholder="粘贴 JSON（支持 // 与 /* */ 注释）"
    />
    <div class="actions">
      <button type="button" class="primary" @click="onFormat">校验 / 格式化</button>
      <button type="button" @click="onMinify">压缩</button>
      <button type="button" @click="onEscape">转义</button>
      <button type="button" @click="onUnescape">去转义</button>
      <button type="button" @click="onUnicodeToCn">Unicode 转中文</button>
      <button type="button" @click="onCnToUnicode">中文转 Unicode</button>
      <button type="button" @click="onCopy">复制</button>
      <button type="button" @click="onClear">清空</button>
    </div>
    <p v-if="status" class="status" :class="{ ok: statusOk, err: !statusOk }">{{ status }}</p>
  </div>
</template>

<style scoped>
.json-tool {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 0;
}
.editor {
  width: 100%;
  min-height: 280px;
  height: 36vh;
  max-height: 420px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.45;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--editor-bg);
  outline: none;
}
.editor:focus {
  border-color: var(--accent);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.actions button {
  font-size: 0.82rem;
  padding: 0.32rem 0.55rem;
}
.status {
  margin: 0;
  font-size: 0.82rem;
}
.status.ok {
  color: var(--success);
}
.status.err {
  color: var(--danger);
}
</style>
