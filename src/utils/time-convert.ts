/** Common IANA time zones for the converter UI */
export const TIME_ZONES: { id: string; label: string }[] = [
  // 东亚 / 东南亚
  { id: 'Asia/Shanghai', label: '中国 · 上海 (UTC+8)' },
  { id: 'Asia/Chongqing', label: '中国 · 重庆 (UTC+8)' },
  { id: 'Asia/Urumqi', label: '中国 · 乌鲁木齐 (UTC+6)' },
  { id: 'Asia/Hong_Kong', label: '香港 (UTC+8)' },
  { id: 'Asia/Macau', label: '澳门 (UTC+8)' },
  { id: 'Asia/Taipei', label: '台北 (UTC+8)' },
  { id: 'Asia/Tokyo', label: '东京 (UTC+9)' },
  { id: 'Asia/Seoul', label: '首尔 (UTC+9)' },
  { id: 'Asia/Singapore', label: '新加坡 (UTC+8)' },
  { id: 'Asia/Kuala_Lumpur', label: '吉隆坡 (UTC+8)' },
  { id: 'Asia/Bangkok', label: '曼谷 (UTC+7)' },
  { id: 'Asia/Jakarta', label: '雅加达 (UTC+7)' },
  { id: 'Asia/Manila', label: '马尼拉 (UTC+8)' },
  { id: 'Asia/Ho_Chi_Minh', label: '胡志明市 (UTC+7)' },
  { id: 'Asia/Phnom_Penh', label: '金边 (UTC+7)' },
  // 南亚 / 中亚 / 西亚
  { id: 'Asia/Kolkata', label: '印度 · 加尔各答 (UTC+5:30)' },
  { id: 'Asia/Dhaka', label: '达卡 (UTC+6)' },
  { id: 'Asia/Kathmandu', label: '加德满都 (UTC+5:45)' },
  { id: 'Asia/Karachi', label: '卡拉奇 (UTC+5)' },
  { id: 'Asia/Dubai', label: '迪拜 (UTC+4)' },
  { id: 'Asia/Riyadh', label: '利雅得 (UTC+3)' },
  { id: 'Asia/Tehran', label: '德黑兰 (UTC+3:30)' },
  { id: 'Asia/Jerusalem', label: '耶路撒冷' },
  { id: 'Asia/Baghdad', label: '巴格达 (UTC+3)' },
  { id: 'Asia/Almaty', label: '阿拉木图 (UTC+5)' },
  // 俄罗斯
  { id: 'Europe/Moscow', label: '莫斯科 (UTC+3)' },
  { id: 'Asia/Yekaterinburg', label: '叶卡捷琳堡 (UTC+5)' },
  { id: 'Asia/Novosibirsk', label: '新西伯利亚 (UTC+7)' },
  { id: 'Asia/Vladivostok', label: '符拉迪沃斯托克 (UTC+10)' },
  // 欧洲
  { id: 'UTC', label: 'UTC' },
  { id: 'Europe/London', label: '伦敦' },
  { id: 'Europe/Dublin', label: '都柏林' },
  { id: 'Europe/Lisbon', label: '里斯本' },
  { id: 'Europe/Paris', label: '巴黎' },
  { id: 'Europe/Berlin', label: '柏林' },
  { id: 'Europe/Amsterdam', label: '阿姆斯特丹' },
  { id: 'Europe/Brussels', label: '布鲁塞尔' },
  { id: 'Europe/Madrid', label: '马德里' },
  { id: 'Europe/Rome', label: '罗马' },
  { id: 'Europe/Zurich', label: '苏黎世' },
  { id: 'Europe/Vienna', label: '维也纳' },
  { id: 'Europe/Stockholm', label: '斯德哥尔摩' },
  { id: 'Europe/Oslo', label: '奥斯陆' },
  { id: 'Europe/Copenhagen', label: '哥本哈根' },
  { id: 'Europe/Helsinki', label: '赫尔辛基' },
  { id: 'Europe/Warsaw', label: '华沙' },
  { id: 'Europe/Prague', label: '布拉格' },
  { id: 'Europe/Athens', label: '雅典' },
  { id: 'Europe/Istanbul', label: '伊斯坦布尔' },
  { id: 'Europe/Bucharest', label: '布加勒斯特' },
  { id: 'Europe/Kyiv', label: '基辅' },
  // 非洲
  { id: 'Africa/Cairo', label: '开罗' },
  { id: 'Africa/Johannesburg', label: '约翰内斯堡 (UTC+2)' },
  { id: 'Africa/Lagos', label: '拉各斯 (UTC+1)' },
  { id: 'Africa/Nairobi', label: '内罗毕 (UTC+3)' },
  { id: 'Africa/Casablanca', label: '卡萨布兰卡' },
  // 北美
  { id: 'America/New_York', label: '纽约 (美东)' },
  { id: 'America/Toronto', label: '多伦多' },
  { id: 'America/Chicago', label: '芝加哥 (美中)' },
  { id: 'America/Denver', label: '丹佛 (美山)' },
  { id: 'America/Phoenix', label: '凤凰城 (无夏令时)' },
  { id: 'America/Los_Angeles', label: '洛杉矶 (美西)' },
  { id: 'America/Vancouver', label: '温哥华' },
  { id: 'America/Anchorage', label: '安克雷奇' },
  { id: 'Pacific/Honolulu', label: '夏威夷 · 檀香山 (UTC-10)' },
  { id: 'America/Mexico_City', label: '墨西哥城' },
  // 南美
  { id: 'America/Sao_Paulo', label: '圣保罗' },
  { id: 'America/Buenos_Aires', label: '布宜诺斯艾利斯' },
  { id: 'America/Santiago', label: '圣地亚哥' },
  { id: 'America/Lima', label: '利马 (UTC-5)' },
  { id: 'America/Bogota', label: '波哥大 (UTC-5)' },
  // 大洋洲
  { id: 'Australia/Sydney', label: '悉尼' },
  { id: 'Australia/Melbourne', label: '墨尔本' },
  { id: 'Australia/Brisbane', label: '布里斯班 (无夏令时)' },
  { id: 'Australia/Perth', label: '珀斯 (UTC+8)' },
  { id: 'Australia/Adelaide', label: '阿德莱德' },
  { id: 'Pacific/Auckland', label: '奥克兰' },
  { id: 'Pacific/Fiji', label: '斐济' },
  { id: 'Pacific/Guam', label: '关岛 (UTC+10)' },
]


export type TimestampUnit = 's' | 'ms'

const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function partsInZone(ms: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  // Some engines report hour "24" for midnight; normalize.
  let hour = Number(map.hour)
  if (hour === 24) hour = 0
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
  }
}

/** Normalize raw input to epoch milliseconds. Accepts 10-digit seconds or 13-digit ms. */
export function parseTimestampInput(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  const abs = Math.abs(n)
  // Heuristic: < 1e12 → seconds; otherwise milliseconds
  if (abs < 1e12) return Math.trunc(n * 1000)
  return Math.trunc(n)
}

export function formatTimestamp(ms: number, unit: TimestampUnit): string {
  if (unit === 's') return String(Math.trunc(ms / 1000))
  return String(Math.trunc(ms))
}

/** Format epoch ms as `YYYY-MM-DD HH:mm:ss` in the given IANA time zone. */
export function formatDateTimeInZone(ms: number, timeZone: string): string {
  if (!Number.isFinite(ms)) throw new Error('无效时间戳')
  const p = partsInZone(ms, timeZone)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}

/**
 * Parse `YYYY-MM-DD HH:mm:ss` (or `T` separator) as wall time in `timeZone`,
 * return epoch milliseconds.
 */
export function parseDateTimeInZone(input: string, timeZone: string): number {
  const m = input.trim().match(DATETIME_RE)
  if (!m) {
    throw new Error('格式应为 YYYY-MM-DD HH:mm:ss')
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])

  // Iteratively resolve UTC ms whose zoned wall-clock matches the desired parts.
  let utc = Date.UTC(year, month - 1, day, hour, minute, second)
  for (let i = 0; i < 4; i++) {
    const p = partsInZone(utc, timeZone)
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    const want = Date.UTC(year, month - 1, day, hour, minute, second)
    const delta = want - asUtc
    if (delta === 0) break
    utc += delta
  }

  const check = partsInZone(utc, timeZone)
  if (
    check.year !== year ||
    check.month !== month ||
    check.day !== day ||
    check.hour !== hour ||
    check.minute !== minute ||
    check.second !== second
  ) {
    throw new Error('该时区下此时间无效（如夏令时跳变）')
  }
  return utc
}

export function detectLocalTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  } catch {
    return 'Asia/Shanghai'
  }
}
