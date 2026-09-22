import { describe, expect, it } from 'vitest'
import {
  formatDateTimeInZone,
  formatTimestamp,
  parseDateTimeInZone,
  parseTimestampInput,
} from './time-convert'

describe('time-convert', () => {
  it('parses second and millisecond timestamps', () => {
    expect(parseTimestampInput('1727000000')).toBe(1727000000_000)
    expect(parseTimestampInput('1727000000000')).toBe(1727000000000)
  })

  it('formats shanghai wall time', () => {
    // 2026-09-22 16:49:54 CST = 2026-09-22 08:49:54 UTC
    const ms = Date.UTC(2026, 8, 22, 8, 49, 54)
    expect(formatDateTimeInZone(ms, 'Asia/Shanghai')).toBe('2026-09-22 16:49:54')
    expect(formatDateTimeInZone(ms, 'UTC')).toBe('2026-09-22 08:49:54')
  })

  it('round-trips datetime in shanghai', () => {
    const ms = parseDateTimeInZone('2026-09-22 16:49:54', 'Asia/Shanghai')
    expect(formatDateTimeInZone(ms, 'Asia/Shanghai')).toBe('2026-09-22 16:49:54')
    expect(formatTimestamp(ms, 's')).toBe(String(Math.trunc(ms / 1000)))
  })

  it('rejects bad datetime', () => {
    expect(() => parseDateTimeInZone('2026/09/22', 'UTC')).toThrow()
  })
})
