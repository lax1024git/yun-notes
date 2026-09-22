import { describe, expect, it } from 'vitest'
import {
  aesDecrypt,
  aesEncrypt,
  base64Decode,
  base64Encode,
  desDecrypt,
  desEncrypt,
  hashText,
  md5,
} from './crypto-tool'

describe('crypto-tool', () => {
  it('base64 round-trip unicode', () => {
    const s = '你好 ABC 🎉'
    expect(base64Decode(base64Encode(s))).toBe(s)
  })

  it('md5 known vector', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e')
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592')
  })

  it('des round-trip with empty and non-empty key', () => {
    const plain = 'hello DES 中文'
    expect(desDecrypt(desEncrypt(plain, ''), '')).toBe(plain)
    expect(desDecrypt(desEncrypt(plain, 'secret'), 'secret')).toBe(plain)
  })

  it('aes round-trip', async () => {
    const plain = 'aes 测试 🔐'
    const c1 = await aesEncrypt(plain, '')
    expect(await aesDecrypt(c1, '')).toBe(plain)
    const c2 = await aesEncrypt(plain, 'pwd')
    expect(await aesDecrypt(c2, 'pwd')).toBe(plain)
  })

  it('sha256', async () => {
    const h = await hashText('abc', 'SHA-256')
    expect(h).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
