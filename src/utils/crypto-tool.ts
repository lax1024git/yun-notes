/** UTF-8 safe Base64 */
export function base64Encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function base64Decode(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, '')
  if (!trimmed) throw new Error('内容为空')
  let bin: string
  try {
    bin = atob(trimmed)
  } catch {
    throw new Error('Base64 格式无效')
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function base64ToBytes(text: string): Uint8Array {
  const trimmed = text.trim().replace(/\s+/g, '')
  let bin: string
  try {
    bin = atob(trimmed)
  } catch {
    throw new Error('Base64 格式无效')
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/* ---------------- MD5 (RFC 1321) ---------------- */

function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
  return (rotl((a + q + x + t) | 0, s) + b) | 0
}
function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t)
}
function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t)
}
function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t)
}
function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t)
}
function rotl(n: number, s: number) {
  return (n << s) | (n >>> (32 - s))
}

export function md5(text: string): string {
  const data = new TextEncoder().encode(text)
  const n = data.length
  const words: number[] = []
  for (let i = 0; i < n; i++) {
    words[i >> 2] |= data[i] << ((i % 4) * 8)
  }
  words[n >> 2] |= 0x80 << ((n % 4) * 8)
  const bitLen = n * 8
  const lenIndex = (((n + 8) >> 6) << 4) + 14
  words[lenIndex] = bitLen
  words[lenIndex + 1] = Math.floor(bitLen / 0x100000000) // high bits for long inputs

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let i = 0; i < words.length; i += 16) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    const w = new Array<number>(16)
    for (let j = 0; j < 16; j++) w[j] = words[i + j] | 0

    a = md5ff(a, b, c, d, w[0], 7, 0xd76aa478)
    d = md5ff(d, a, b, c, w[1], 12, 0xe8c7b756)
    c = md5ff(c, d, a, b, w[2], 17, 0x242070db)
    b = md5ff(b, c, d, a, w[3], 22, 0xc1bdceee)
    a = md5ff(a, b, c, d, w[4], 7, 0xf57c0faf)
    d = md5ff(d, a, b, c, w[5], 12, 0x4787c62a)
    c = md5ff(c, d, a, b, w[6], 17, 0xa8304613)
    b = md5ff(b, c, d, a, w[7], 22, 0xfd469501)
    a = md5ff(a, b, c, d, w[8], 7, 0x698098d8)
    d = md5ff(d, a, b, c, w[9], 12, 0x8b44f7af)
    c = md5ff(c, d, a, b, w[10], 17, 0xffff5bb1)
    b = md5ff(b, c, d, a, w[11], 22, 0x895cd7be)
    a = md5ff(a, b, c, d, w[12], 7, 0x6b901122)
    d = md5ff(d, a, b, c, w[13], 12, 0xfd987193)
    c = md5ff(c, d, a, b, w[14], 17, 0xa679438e)
    b = md5ff(b, c, d, a, w[15], 22, 0x49b40821)

    a = md5gg(a, b, c, d, w[1], 5, 0xf61e2562)
    d = md5gg(d, a, b, c, w[6], 9, 0xc040b340)
    c = md5gg(c, d, a, b, w[11], 14, 0x265e5a51)
    b = md5gg(b, c, d, a, w[0], 20, 0xe9b6c7aa)
    a = md5gg(a, b, c, d, w[5], 5, 0xd62f105d)
    d = md5gg(d, a, b, c, w[10], 9, 0x02441453)
    c = md5gg(c, d, a, b, w[15], 14, 0xd8a1e681)
    b = md5gg(b, c, d, a, w[4], 20, 0xe7d3fbc8)
    a = md5gg(a, b, c, d, w[9], 5, 0x21e1cde6)
    d = md5gg(d, a, b, c, w[14], 9, 0xc33707d6)
    c = md5gg(c, d, a, b, w[3], 14, 0xf4d50d87)
    b = md5gg(b, c, d, a, w[8], 20, 0x455a14ed)
    a = md5gg(a, b, c, d, w[13], 5, 0xa9e3e905)
    d = md5gg(d, a, b, c, w[2], 9, 0xfcefa3f8)
    c = md5gg(c, d, a, b, w[7], 14, 0x676f02d9)
    b = md5gg(b, c, d, a, w[12], 20, 0x8d2a4c8a)

    a = md5hh(a, b, c, d, w[5], 4, 0xfffa3942)
    d = md5hh(d, a, b, c, w[8], 11, 0x8771f681)
    c = md5hh(c, d, a, b, w[11], 16, 0x6d9d6122)
    b = md5hh(b, c, d, a, w[14], 23, 0xfde5380c)
    a = md5hh(a, b, c, d, w[1], 4, 0xa4beea44)
    d = md5hh(d, a, b, c, w[4], 11, 0x4bdecfa9)
    c = md5hh(c, d, a, b, w[7], 16, 0xf6bb4b60)
    b = md5hh(b, c, d, a, w[10], 23, 0xbebfbc70)
    a = md5hh(a, b, c, d, w[13], 4, 0x289b7ec6)
    d = md5hh(d, a, b, c, w[0], 11, 0xeaa127fa)
    c = md5hh(c, d, a, b, w[3], 16, 0xd4ef3085)
    b = md5hh(b, c, d, a, w[6], 23, 0x04881d05)
    a = md5hh(a, b, c, d, w[9], 4, 0xd9d4d039)
    d = md5hh(d, a, b, c, w[12], 11, 0xe6db99e5)
    c = md5hh(c, d, a, b, w[15], 16, 0x1fa27cf8)
    b = md5hh(b, c, d, a, w[2], 23, 0xc4ac5665)

    a = md5ii(a, b, c, d, w[0], 6, 0xf4292244)
    d = md5ii(d, a, b, c, w[7], 10, 0x432aff97)
    c = md5ii(c, d, a, b, w[14], 15, 0xab9423a7)
    b = md5ii(b, c, d, a, w[5], 21, 0xfc93a039)
    a = md5ii(a, b, c, d, w[12], 6, 0x655b59c3)
    d = md5ii(d, a, b, c, w[3], 10, 0x8f0ccc92)
    c = md5ii(c, d, a, b, w[10], 15, 0xffeff47d)
    b = md5ii(b, c, d, a, w[1], 21, 0x85845dd1)
    a = md5ii(a, b, c, d, w[8], 6, 0x6fa87e4f)
    d = md5ii(d, a, b, c, w[15], 10, 0xfe2ce6e0)
    c = md5ii(c, d, a, b, w[6], 15, 0xa3014314)
    b = md5ii(b, c, d, a, w[13], 21, 0x4e0811a1)
    a = md5ii(a, b, c, d, w[4], 6, 0xf7537e82)
    d = md5ii(d, a, b, c, w[11], 10, 0xbd3af235)
    c = md5ii(c, d, a, b, w[2], 15, 0x2ad7d2bb)
    b = md5ii(b, c, d, a, w[9], 21, 0xeb86d391)

    a0 = (a0 + a) | 0
    b0 = (b0 + b) | 0
    c0 = (c0 + c) | 0
    d0 = (d0 + d) | 0
  }

  const hex = (n: number) => {
    let s = ''
    for (let i = 0; i < 4; i++) {
      s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0')
    }
    return s
  }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0)
}

/* ---------------- Hash (WebCrypto) ---------------- */

export type HashAlgo = 'SHA-1' | 'SHA-256' | 'SHA-512'

export async function hashText(text: string, algo: HashAlgo): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest(algo, data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ---------------- AES-256-GCM (password optional) ---------------- */

async function aesKeyFromPassword(password: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  // Fixed salt for tool-style reproducibility (same password → same key).
  // IV is still random per message.
  const salt = new TextEncoder().encode('yunnotes-aes-tool-v1')
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Output: base64(iv[12] + ciphertext+tag) */
export async function aesEncrypt(plain: string, password: string): Promise<string> {
  const key = await aesKeyFromPassword(password)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  )
  const out = new Uint8Array(iv.length + cipher.length)
  out.set(iv, 0)
  out.set(cipher, iv.length)
  return bytesToBase64(out)
}

export async function aesDecrypt(cipherB64: string, password: string): Promise<string> {
  const raw = base64ToBytes(cipherB64)
  if (raw.length < 13) throw new Error('密文过短或无效')
  const iv = raw.slice(0, 12)
  const data = raw.slice(12)
  const key = await aesKeyFromPassword(password)
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data)
    return new TextDecoder().decode(plain)
  } catch {
    throw new Error('解密失败（密钥错误或密文损坏）')
  }
}

/* ---------------- DES-ECB PKCS#7 (password optional) ---------------- */

// Compact DES for utility tools (not for high-security use).
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4, 62, 54, 46, 38, 30, 22, 14, 6, 64,
  56, 48, 40, 32, 24, 16, 8, 57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3, 61, 53,
  45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
]
const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31, 38, 6, 46, 14, 54, 22, 62, 30, 37,
  5, 45, 13, 53, 21, 61, 29, 36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27, 34, 2,
  42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
]
const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9, 8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17, 16, 17, 18,
  19, 20, 21, 20, 21, 22, 23, 24, 25, 24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
]
const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10, 2, 8, 24, 14, 32, 27, 3, 9, 19, 13,
  30, 6, 22, 11, 4, 25,
]
const SBOX = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7, 0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12,
    11, 9, 5, 3, 8, 4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0, 15, 12, 8, 2, 4, 9, 1,
    7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10, 3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10,
    6, 9, 11, 5, 0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15, 13, 8, 10, 1, 3, 15, 4, 2,
    11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8, 13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14,
    12, 11, 15, 1, 13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7, 1, 10, 13, 0, 6, 9, 8, 7,
    4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15, 13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12,
    1, 10, 14, 9, 10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4, 3, 15, 0, 6, 10, 1, 13, 8,
    9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9, 14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15,
    10, 3, 9, 8, 6, 4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14, 11, 8, 12, 7, 1, 14, 2,
    13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11, 10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14,
    0, 11, 3, 8, 9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6, 4, 3, 2, 12, 9, 5, 15, 10,
    11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1, 13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12,
    2, 15, 8, 6, 1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2, 6, 11, 13, 8, 1, 4, 10, 7,
    9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7, 1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11,
    0, 14, 9, 2, 7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8, 2, 1, 14, 7, 4, 10, 8, 13,
    15, 12, 9, 0, 3, 5, 6, 11,
  ],
]
const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18, 10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60,
  52, 44, 36, 63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22, 14, 6, 61, 53, 45, 37, 29, 21,
  13, 5, 28, 20, 12, 4,
]
const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10, 23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2, 41, 52,
  31, 37, 47, 55, 30, 40, 51, 45, 33, 48, 44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
]
const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1]

function permute(input: bigint, table: number[], inBits: number): bigint {
  let out = 0n
  for (let i = 0; i < table.length; i++) {
    const bit = (input >> BigInt(inBits - table[i])) & 1n
    out = (out << 1n) | bit
  }
  return out
}

function desKeySchedule(key8: Uint8Array): bigint[] {
  let key = 0n
  for (const b of key8) key = (key << 8n) | BigInt(b)
  let cd = permute(key, PC1, 64)
  let c = cd >> 28n
  let d = cd & 0x0fffffffn
  const mask28 = 0x0fffffffn
  const subkeys: bigint[] = []
  for (let i = 0; i < 16; i++) {
    const s = SHIFTS[i]
    c = ((c << BigInt(s)) | (c >> BigInt(28 - s))) & mask28
    d = ((d << BigInt(s)) | (d >> BigInt(28 - s))) & mask28
    const cd2 = (c << 28n) | d
    subkeys.push(permute(cd2, PC2, 56))
  }
  return subkeys
}

function desF(r: bigint, sk: bigint): bigint {
  const expanded = permute(r, E, 32) ^ sk
  let sOut = 0n
  for (let i = 0; i < 8; i++) {
    const six = Number((expanded >> BigInt(42 - i * 6)) & 0x3fn)
    const row = ((six & 0x20) >> 4) | (six & 1)
    const col = (six >> 1) & 0xf
    sOut = (sOut << 4n) | BigInt(SBOX[i][row * 16 + col])
  }
  return permute(sOut, P, 32)
}

function desBlock(block: bigint, subkeys: bigint[], decrypt: boolean): bigint {
  let lr = permute(block, IP, 64)
  let l = lr >> 32n
  let r = lr & 0xffffffffn
  const order = decrypt ? [...subkeys].reverse() : subkeys
  for (const sk of order) {
    const nl = r
    const nr = l ^ desF(r, sk)
    l = nl
    r = nr
  }
  const pre = (r << 32n) | l
  return permute(pre, FP, 64)
}

function passwordToDesKey(password: string): Uint8Array {
  const bytes = new TextEncoder().encode(password)
  const key = new Uint8Array(8)
  for (let i = 0; i < 8; i++) key[i] = bytes[i] ?? 0
  return key
}

function pkcs7Pad(data: Uint8Array, block = 8): Uint8Array {
  const pad = block - (data.length % block)
  const out = new Uint8Array(data.length + pad)
  out.set(data)
  out.fill(pad, data.length)
  return out
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (!data.length) throw new Error('密文无效')
  const pad = data[data.length - 1]
  if (pad < 1 || pad > 8 || pad > data.length) throw new Error('填充无效，解密失败')
  for (let i = data.length - pad; i < data.length; i++) {
    if (data[i] !== pad) throw new Error('填充无效，解密失败')
  }
  return data.slice(0, data.length - pad)
}

function bytesToBlock(bytes: Uint8Array, offset: number): bigint {
  let n = 0n
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bytes[offset + i])
  return n
}

function blockToBytes(n: bigint, out: Uint8Array, offset: number) {
  for (let i = 7; i >= 0; i--) {
    out[offset + i] = Number(n & 0xffn)
    n >>= 8n
  }
}

export function desEncrypt(plain: string, password: string): string {
  const subkeys = desKeySchedule(passwordToDesKey(password))
  const padded = pkcs7Pad(new TextEncoder().encode(plain))
  const out = new Uint8Array(padded.length)
  for (let i = 0; i < padded.length; i += 8) {
    const c = desBlock(bytesToBlock(padded, i), subkeys, false)
    blockToBytes(c, out, i)
  }
  return bytesToBase64(out)
}

export function desDecrypt(cipherB64: string, password: string): string {
  const raw = base64ToBytes(cipherB64)
  if (raw.length === 0 || raw.length % 8 !== 0) throw new Error('密文长度无效')
  const subkeys = desKeySchedule(passwordToDesKey(password))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 8) {
    const p = desBlock(bytesToBlock(raw, i), subkeys, true)
    blockToBytes(p, out, i)
  }
  return new TextDecoder().decode(pkcs7Unpad(out))
}
