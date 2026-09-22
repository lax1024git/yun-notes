<script setup lang="ts">
import { computed, ref } from 'vue'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useToastStore } from '../../stores/toast'
import {
  aesDecrypt,
  aesEncrypt,
  base64Decode,
  base64Encode,
  desDecrypt,
  desEncrypt,
  hashText,
  md5,
  type HashAlgo,
} from '../../utils/crypto-tool'

type Mode = 'aes' | 'des' | 'md5' | 'base64' | 'hash'

const toast = useToastStore()
const mode = ref<Mode>('aes')
const plain = ref('')
const cipher = ref('')
const key = ref('')
const hashAlgo = ref<HashAlgo>('SHA-256')
const busy = ref(false)
const status = ref('')
const statusOk = ref(true)

const needsKey = computed(() => mode.value === 'aes' || mode.value === 'des')
const oneWay = computed(() => mode.value === 'md5' || mode.value === 'hash')

const modes: { id: Mode; label: string }[] = [
  { id: 'aes', label: 'AES加密/解密' },
  { id: 'des', label: 'DES加密/解密' },
  { id: 'md5', label: 'MD5' },
  { id: 'base64', label: 'Base64加/解密' },
  { id: 'hash', label: 'Hash' },
]

function setOk(msg: string) {
  statusOk.value = true
  status.value = msg
}
function setErr(msg: string) {
  statusOk.value = false
  status.value = msg
}

async function onEncrypt() {
  busy.value = true
  status.value = ''
  try {
    if (mode.value === 'aes') {
      cipher.value = await aesEncrypt(plain.value, key.value)
      setOk('AES 加密完成')
    } else if (mode.value === 'des') {
      cipher.value = desEncrypt(plain.value, key.value)
      setOk('DES 加密完成')
    } else if (mode.value === 'base64') {
      cipher.value = base64Encode(plain.value)
      setOk('Base64 编码完成')
    } else if (mode.value === 'md5') {
      cipher.value = md5(plain.value)
      setOk('MD5 已生成（单向，不可解密）')
    } else {
      cipher.value = await hashText(plain.value, hashAlgo.value)
      setOk(`${hashAlgo.value} 已生成（单向，不可解密）`)
    }
  } catch (e) {
    setErr(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function onDecrypt() {
  if (oneWay.value) {
    setErr('哈希不可逆，无法解密')
    return
  }
  busy.value = true
  status.value = ''
  try {
    if (mode.value === 'aes') {
      plain.value = await aesDecrypt(cipher.value, key.value)
      setOk('AES 解密完成')
    } else if (mode.value === 'des') {
      plain.value = desDecrypt(cipher.value, key.value)
      setOk('DES 解密完成')
    } else if (mode.value === 'base64') {
      plain.value = base64Decode(cipher.value)
      setOk('Base64 解码完成')
    }
  } catch (e) {
    setErr(e instanceof Error ? e.message : String(e))
  } finally {
    busy.value = false
  }
}

async function copy(text: string) {
  if (!text) return
  try {
    await writeText(text)
    toast.success('已复制')
  } catch {
    toast.error('复制失败')
  }
}

function swap() {
  const a = plain.value
  plain.value = cipher.value
  cipher.value = a
}

function clearAll() {
  plain.value = ''
  cipher.value = ''
  status.value = ''
}
</script>

<template>
  <div class="crypto-tool">
    <div class="subtabs">
      <button
        v-for="m in modes"
        :key="m.id"
        type="button"
        class="sub"
        :class="{ on: mode === m.id }"
        @click="mode = m.id"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="grid">
      <div class="col">
        <div class="label-row">
          <span class="muted">明文</span>
          <button type="button" class="link" @click="copy(plain)">复制</button>
        </div>
        <textarea
          v-model="plain"
          spellcheck="false"
          placeholder="在此输入明文，然后加密即可。"
        />
      </div>

      <div class="mid">
        <template v-if="needsKey">
          <input v-model="key" type="text" placeholder="在此输入密钥" />
          <p class="muted tip">密码是可选项，也就是可以不填。</p>
        </template>
        <template v-else-if="mode === 'hash'">
          <select v-model="hashAlgo" aria-label="哈希算法">
            <option value="SHA-1">SHA-1</option>
            <option value="SHA-256">SHA-256</option>
            <option value="SHA-512">SHA-512</option>
          </select>
          <p class="muted tip">哈希单向不可逆，仅支持「加密」生成摘要。</p>
        </template>
        <template v-else-if="mode === 'md5'">
          <p class="muted tip">MD5 单向不可逆，仅支持生成摘要。</p>
        </template>
        <template v-else>
          <p class="muted tip">Base64 编码 / 解码，无需密钥。</p>
        </template>

        <div class="btns">
          <button
            type="button"
            class="primary"
            :disabled="busy || oneWay"
            title="用右侧密文解密到左侧"
            @click="onDecrypt"
          >
            ← 解密
          </button>
          <button
            type="button"
            class="primary"
            :disabled="busy"
            title="用左侧明文加密到右侧"
            @click="onEncrypt"
          >
            加密 →
          </button>
        </div>
        <div class="extra">
          <button type="button" :disabled="busy" @click="swap">交换</button>
          <button type="button" :disabled="busy" @click="clearAll">清空</button>
        </div>
      </div>

      <div class="col">
        <div class="label-row">
          <span class="muted">{{ oneWay ? '摘要 / 结果' : '密文' }}</span>
          <button type="button" class="link" @click="copy(cipher)">复制</button>
        </div>
        <textarea
          v-model="cipher"
          spellcheck="false"
          :placeholder="
            oneWay
              ? '哈希结果会显示在这里。'
              : '加密后的密文会显示在这里。也可以是待解密的密文。'
          "
        />
      </div>
    </div>

    <p v-if="status" class="status" :class="{ ok: statusOk, err: !statusOk }">{{ status }}</p>
  </div>
</template>

<style scoped>
.crypto-tool {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.subtabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.sub {
  font-size: 0.78rem;
  padding: 0.28rem 0.5rem;
}
.sub.on {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--accent);
  font-weight: 600;
}
.grid {
  display: grid;
  grid-template-columns: 1fr minmax(150px, 168px) 1fr;
  gap: 0.55rem;
  align-items: stretch;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}
.link {
  border: none;
  background: transparent;
  color: var(--accent);
  padding: 0;
  font-size: 0.78rem;
}
textarea {
  flex: 1;
  min-height: 220px;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 0.82rem;
  line-height: 1.45;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--editor-bg);
  outline: none;
}
textarea:focus {
  border-color: var(--accent);
}
.mid {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  justify-content: center;
  padding-top: 1.4rem;
}
.mid input,
.mid select {
  width: 100%;
}
.tip {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.35;
}
.btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.btns button {
  font-size: 0.82rem;
  padding: 0.45rem 0.35rem;
}
.extra {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.35rem;
}
.extra button {
  font-size: 0.78rem;
  padding: 0.3rem;
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

@media (max-width: 640px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .mid {
    padding-top: 0;
  }
}
</style>
