import { describe, expect, it } from 'vitest'
import {
  chineseToUnicode,
  escapeJson,
  formatJson,
  minifyJson,
  unescapeJson,
  unicodeToChinese,
} from './json-tool'

describe('json-tool', () => {
  it('formats and minifies', () => {
    const raw = '{"a":1,"b":[2,3]}'
    expect(formatJson(raw)).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}')
    expect(minifyJson(formatJson(raw))).toBe(raw)
  })

  it('escapes and unescapes', () => {
    const inner = '{"x":"hi"}'
    const esc = escapeJson(inner)
    expect(esc.startsWith('"')).toBe(true)
    expect(unescapeJson(esc)).toBe(inner)
  })

  it('unicode round-trip for chinese', () => {
    const s = '你好'
    const u = chineseToUnicode(s)
    expect(u).toBe('\\u4f60\\u597d')
    expect(unicodeToChinese(u)).toBe(s)
  })
})
