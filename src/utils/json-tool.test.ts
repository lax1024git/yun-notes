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

  it('formats json with line comments', () => {
    const raw = `{
      "level": 0, //等级
      "status": 1, //用户状态
      "url": "https://example.com/path//keep"
    }`
    const out = formatJson(raw)
    expect(JSON.parse(out)).toEqual({
      level: 0,
      status: 1,
      url: 'https://example.com/path//keep',
    })
  })

  it('formats json with block comments and trailing commas', () => {
    const raw = `{
      "a": 1, /* note */
      "b": [2, 3,],
    }`
    expect(JSON.parse(formatJson(raw))).toEqual({ a: 1, b: [2, 3] })
  })

  it('unicode round-trip for chinese', () => {
    const s = '你好'
    const u = chineseToUnicode(s)
    expect(u).toBe('\\u4f60\\u597d')
    expect(unicodeToChinese(u)).toBe(s)
  })
})
