<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from 'vue'
import { open as pickPath } from '@tauri-apps/plugin-dialog'
import { api, errorMessage } from '../../api/tauri'
import { useToastStore } from '../../stores/toast'
import {
  blobToUint8Array,
  convertImage,
  extForMime,
  formatBytes,
  replaceExt,
  type ImageMime,
  type ResizeMode,
} from '../../utils/image-convert'

interface ToolboxPin {
  pin: () => void
  unpin: () => void
}

const toolboxPin = inject<ToolboxPin | null>('toolboxPin', null)

interface Item {
  id: string
  file: File
  name: string
  size: number
  previewUrl: string
  status: 'pending' | 'done' | 'error'
  message?: string
  outSize?: number
  outName?: string
}

const toast = useToastStore()
const items = ref<Item[]>([])
const busy = ref(false)
const progress = ref(0)

const format = ref<ImageMime>('image/jpeg')
const quality = ref(0.85)
const resizeMode = ref<ResizeMode>('max')
const width = ref<number | null>(1920)
const height = ref<number | null>(null)
const scalePercent = ref(50)
const keepAspect = ref(true)

const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const totalIn = computed(() => items.value.reduce((s, i) => s + i.size, 0))
const canConvert = computed(() => items.value.length > 0 && !busy.value)

function joinPath(dir: string, name: string): string {
  const sep = dir.includes('\\') ? '\\' : '/'
  if (dir.endsWith('\\') || dir.endsWith('/')) return `${dir}${name}`
  return `${dir}${sep}${name}`
}

function revokeAll() {
  for (const it of items.value) URL.revokeObjectURL(it.previewUrl)
}

function addFiles(list: FileList | File[]) {
  const files = Array.from(list).filter((f) => f.type.startsWith('image/'))
  if (!files.length) {
    toast.error('请选择图片文件')
    return
  }
  for (const file of files) {
    const id = `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`
    items.value.push({
      id,
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      status: 'pending',
    })
  }
}

function onPickClick() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) addFiles(input.files)
  input.value = ''
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
}

function removeItem(id: string) {
  const idx = items.value.findIndex((i) => i.id === id)
  if (idx < 0) return
  URL.revokeObjectURL(items.value[idx].previewUrl)
  items.value.splice(idx, 1)
}

function clearAll() {
  revokeAll()
  items.value = []
  progress.value = 0
}

function buildOptions() {
  return {
    format: format.value,
    quality: quality.value,
    resize: {
      mode: resizeMode.value,
      width: width.value ?? undefined,
      height: height.value ?? undefined,
      scalePercent: scalePercent.value,
      keepAspect: keepAspect.value,
    },
  }
}

async function convertAll() {
  if (!items.value.length) return

  toolboxPin?.pin()
  let dest: string | string[] | null
  try {
    dest = await pickPath({
      directory: true,
      multiple: false,
      title: '选择导出目录',
    })
  } finally {
    toolboxPin?.unpin()
  }
  if (typeof dest !== 'string') return

  busy.value = true
  toolboxPin?.pin()
  progress.value = 0
  let ok = 0
  let fail = 0
  const opts = buildOptions()
  const ext = extForMime(opts.format)

  try {
    for (let i = 0; i < items.value.length; i++) {
      const it = items.value[i]
      it.status = 'pending'
      it.message = undefined
      try {
        const { blob, width: w, height: h } = await convertImage(it.file, opts)
        const outName = replaceExt(it.name, ext)
        const outPath = joinPath(dest, outName)
        const bytes = await blobToUint8Array(blob)
        await api.fs.writeBytes(outPath, bytes)
        it.status = 'done'
        it.outSize = blob.size
        it.outName = outName
        it.message = `${w}×${h} · ${formatBytes(blob.size)}`
        ok++
      } catch (e) {
        it.status = 'error'
        it.message = errorMessage(e)
        fail++
      }
      progress.value = Math.round(((i + 1) / items.value.length) * 100)
    }
    if (fail === 0) toast.success(`已导出 ${ok} 张到：${dest}`)
    else toast.error(`完成：成功 ${ok}，失败 ${fail}`)
  } finally {
    busy.value = false
    toolboxPin?.unpin()
  }
}

onUnmounted(() => revokeAll())
</script>


<template>
  <div class="img-tool">
    <div
      class="drop"
      :class="{ over: dragOver }"
      @dragover.prevent="dragOver = true"
      @dragleave.prevent="dragOver = false"
      @drop="onDrop"
      @click="onPickClick"
    >
      <p>点击或拖拽添加图片（支持批量）</p>
      <p class="muted tip">JPG / PNG / WebP / GIF / BMP …</p>
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        multiple
        hidden
        @change="onFileChange"
      />
    </div>

    <div class="opts">
      <label class="field">
        <span class="muted">输出格式</span>
        <select v-model="format">
          <option value="image/jpeg">JPEG</option>
          <option value="image/png">PNG</option>
          <option value="image/webp">WebP</option>
        </select>
      </label>

      <label class="field">
        <span class="muted">压缩质量 {{ Math.round(quality * 100) }}%</span>
        <input
          v-model.number="quality"
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          :disabled="format === 'image/png'"
        />
      </label>

      <label class="field">
        <span class="muted">尺寸模式</span>
        <select v-model="resizeMode">
          <option value="none">保持原尺寸</option>
          <option value="max">限制最大宽高</option>
          <option value="exact">指定宽高</option>
          <option value="scale">按比例缩放</option>
        </select>
      </label>

      <template v-if="resizeMode === 'max' || resizeMode === 'exact'">
        <label class="field">
          <span class="muted">宽度 (px，可空)</span>
          <input v-model.number="width" type="number" min="1" placeholder="如 1920" />
        </label>
        <label class="field">
          <span class="muted">高度 (px，可空)</span>
          <input v-model.number="height" type="number" min="1" placeholder="如 1080" />
        </label>
      </template>

      <label v-if="resizeMode === 'exact'" class="check">
        <input v-model="keepAspect" type="checkbox" />
        <span>保持宽高比（适应框内）</span>
      </label>

      <label v-if="resizeMode === 'scale'" class="field">
        <span class="muted">缩放 {{ scalePercent }}%</span>
        <input v-model.number="scalePercent" type="range" min="5" max="200" step="5" />
      </label>
    </div>

    <div class="row actions">
      <button type="button" class="primary" :disabled="!canConvert" @click="convertAll">
        {{ busy ? `处理中 ${progress}%…` : `批量转换 (${items.length})` }}
      </button>
      <button type="button" :disabled="!items.length || busy" @click="clearAll">清空列表</button>
    </div>

    <p v-if="items.length" class="muted summary">
      共 {{ items.length }} 张 · 约 {{ formatBytes(totalIn) }}
    </p>

    <ul v-if="items.length" class="list">
      <li v-for="it in items" :key="it.id" :class="it.status">
        <img :src="it.previewUrl" :alt="it.name" />
        <div class="meta">
          <div class="name" :title="it.name">{{ it.name }}</div>
          <div class="muted small">
            {{ formatBytes(it.size) }}
            <template v-if="it.message"> · {{ it.message }}</template>
          </div>
        </div>
        <button type="button" class="rm" :disabled="busy" @click="removeItem(it.id)">×</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.img-tool {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.drop {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 1rem 0.75rem;
  text-align: center;
  cursor: pointer;
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}
.drop.over,
.drop:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.drop p {
  margin: 0;
  font-size: 0.9rem;
}
.tip {
  margin-top: 0.25rem !important;
  font-size: 0.75rem !important;
}
.opts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 0.65rem;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
}
.field input[type='number'],
.field select {
  width: 100%;
}
.check {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.summary {
  margin: 0;
  font-size: 0.8rem;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 220px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.list li {
  display: grid;
  grid-template-columns: 44px 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
}
.list li.done {
  border-color: color-mix(in srgb, var(--success) 45%, var(--border));
}
.list li.error {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
}
.list img {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 4px;
  background: var(--border);
}
.meta {
  min-width: 0;
}
.name {
  font-size: 0.85rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.small {
  font-size: 0.75rem;
}
.rm {
  border: none;
  background: transparent;
  font-size: 1.1rem;
  color: var(--muted);
  padding: 0.15rem 0.35rem;
}
.rm:hover {
  color: var(--danger);
}

@media (max-width: 520px) {
  .opts {
    grid-template-columns: 1fr;
  }
}
</style>
