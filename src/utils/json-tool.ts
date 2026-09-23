/**
 * Strip JSONC-style comments (`//` and block comments) without touching string contents.
 * Also removes trailing commas before `}` / `]` (common in commented API samples).
 */
export function stripJsonComments(raw: string): string {
  let out = ''
  let i = 0
  const n = raw.length

  while (i < n) {
    const ch = raw[i]!
    const next = i + 1 < n ? raw[i + 1]! : ''

    // String literal
    if (ch === '"') {
      out += ch
      i += 1
      while (i < n) {
        const c = raw[i]!
        out += c
        if (c === '\\') {
          if (i + 1 < n) {
            out += raw[i + 1]
            i += 2
            continue
          }
        } else if (c === '"') {
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    // Line comment //
    if (ch === '/' && next === '/') {
      i += 2
      while (i < n && raw[i] !== '\n' && raw[i] !== '\r') i += 1
      continue
    }

    // Block comment /* */
    if (ch === '/' && next === '*') {
      i += 2
      while (i + 1 < n && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1
      i = Math.min(i + 2, n)
      // Keep a space so tokens don't glue together
      out += ' '
      continue
    }

    out += ch
    i += 1
  }

  return stripTrailingCommas(out)
}

/** Remove commas that appear right before `}` or `]`. */
function stripTrailingCommas(text: string): string {
  let out = ''
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]!

    if (ch === '"') {
      out += ch
      i += 1
      while (i < n) {
        const c = text[i]!
        out += c
        if (c === '\\') {
          if (i + 1 < n) {
            out += text[i + 1]
            i += 2
            continue
          }
        } else if (c === '"') {
          i += 1
          break
        }
        i += 1
      }
      continue
    }

    if (ch === ',') {
      let j = i + 1
      while (j < n && /[\s\r\n]/.test(text[j]!)) j += 1
      if (j < n && (text[j] === '}' || text[j] === ']')) {
        i += 1
        continue
      }
    }

    out += ch
    i += 1
  }

  return out
}

/** Try to parse JSON; accepts JSONC comments and a JSON string literal wrapping JSON. */
export function parseJsonFlexible(raw: string): unknown {
  const text = stripJsonComments(raw).trim()
  if (!text) throw new Error('内容为空')
  try {
    return JSON.parse(text)
  } catch (first) {
    // Sometimes pasted content is a quoted JSON string
    try {
      const once = JSON.parse(text)
      if (typeof once === 'string') return JSON.parse(stripJsonComments(once))
    } catch {
      /* fall through */
    }
    const msg = first instanceof Error ? first.message : String(first)
    throw new Error(msg)
  }
}

export function formatJson(raw: string, indent = 2): string {
  const value = parseJsonFlexible(raw)
  return JSON.stringify(value, null, indent)
}

export function minifyJson(raw: string): string {
  const value = parseJsonFlexible(raw)
  return JSON.stringify(value)
}

/** Escape JSON text as a JSON string literal (for embedding). */
export function escapeJson(raw: string): string {
  return JSON.stringify(raw)
}

/**
 * Unescape a JSON string literal, or content containing `\"` / `\n` sequences.
 * Returns the decoded string (often JSON text ready to format).
 */
export function unescapeJson(raw: string): string {
  const text = raw.trim()
  if (!text) throw new Error('内容为空')

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'string') return parsed
  } catch {
    /* try as escaped body without outer quotes */
  }

  try {
    const wrapped = text.startsWith('"') && text.endsWith('"') ? text : `"${text}"`
    const parsed = JSON.parse(wrapped)
    if (typeof parsed === 'string') return parsed
    return JSON.stringify(parsed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`去转义失败: ${msg}`)
  }
}

/** Decode `\uXXXX` sequences (and JSON string if fully quoted). */
export function unicodeToChinese(raw: string): string {
  const text = raw
  // If whole input is a JSON string, decode via JSON.parse
  const trimmed = text.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    try {
      const asJson = trimmed.startsWith("'")
        ? `"${trimmed.slice(1, -1).replace(/"/g, '\\"')}"`
        : trimmed
      const v = JSON.parse(asJson)
      if (typeof v === 'string') return v
    } catch {
      /* continue */
    }
  }
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
}

/** Encode non-ASCII characters as `\uXXXX` (keeps ASCII as-is). */
export function chineseToUnicode(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0)!
    if (code <= 0x7f) {
      out += ch
    } else if (code <= 0xffff) {
      out += `\\u${code.toString(16).padStart(4, '0')}`
    } else {
      // surrogate pair
      const cp = code - 0x10000
      const high = 0xd800 + (cp >> 10)
      const low = 0xdc00 + (cp & 0x3ff)
      out += `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`
    }
  }
  return out
}
