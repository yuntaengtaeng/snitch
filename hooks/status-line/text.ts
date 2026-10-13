/** 상태줄 문구 */

export type RateLimit = {
  kind: string
  percentUsed: number
  /** 한도 초기화 시각, ISO 8601 */
  resetsAt?: string
}

const LIMIT_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: '지출한도',
}

/** 모델 ID 의 표시용 이름 (claude-opus-5-5 는 Opus 5.5) */
export function shortModelName(id: string): string {
  const core = id.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const m = /^([a-z]+)-(\d+)(?:-(\d+))?(.*)$/.exec(core)
  if (!m) return core || id
  const family = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  const version = m[3] !== undefined ? `${m[2]}.${m[3]}` : (m[2] ?? '')
  return `${family} ${version}${m[4] ?? ''}`
}

/** 사용률의 남은 비율(0~100, 정수) */
export function remainingPercent(limit: RateLimit): number {
  return Math.min(100, Math.max(0, Math.round(100 - limit.percentUsed)))
}

const HOUR_MS = 3_600_000

/** 한도 초기화 시각 표시, 하루 안이면 시:분, 그 뒤면 월/일, 시각이 없거나 지났으면 빈 문자열 */
export function resetText(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const at = new Date(resetsAt)
  const ms = at.getTime()
  if (Number.isNaN(ms) || ms <= now) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return ms - now < 24 * HOUR_MS ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : `${at.getMonth() + 1}/${at.getDate()}`
}

/** 상태줄 문자열, 모델과 effort, 남은 한도와 초기화 시각, 보드 요약 */
export function statusText(input: {
  model?: string | null
  effort?: string | null
  rateLimits: readonly RateLimit[]
  now: number
  board?: readonly string[]
}): string {
  const parts: string[] = []
  if (input.model) parts.push([shortModelName(input.model), input.effort].filter(Boolean).join(' '))

  const limits = input.rateLimits
    .map(r => {
      const reset = resetText(r.resetsAt, input.now)
      return `${LIMIT_LABEL[r.kind] ?? r.kind} ${remainingPercent(r)}%${reset ? ` ${reset} 초기화` : ''}`
    })
    .join(', ')
  if (limits) parts.push(`남은 한도 ${limits}`)
  parts.push(...(input.board ?? []))

  return parts.join('  |  ')
}

export type LimitGauge = {
  /** 5h, 7d 같은 한도 이름 */
  label: string
  /** 남은 비율(0~100, 정수) */
  remaining: number
  /** 남은 만큼 채운 막대 */
  bar: string
  level: 'plenty' | 'half' | 'low'
  /** 초기화 시각, 모르면 빈 문자열 */
  reset: string
}

/** 사용률을 남은 한도 막대로 바꾼 값, segments 는 막대 칸 수 */
export function limitGauge(limit: RateLimit, segments: number, now: number): LimitGauge {
  const remaining = remainingPercent(limit)
  const filled = Math.round((remaining / 100) * segments)
  return {
    label: LIMIT_LABEL[limit.kind] ?? limit.kind,
    remaining,
    bar: '▰'.repeat(filled) + '▱'.repeat(segments - filled),
    level: remaining < 20 ? 'low' : remaining < 50 ? 'half' : 'plenty',
    reset: resetText(limit.resetsAt, now),
  }
}
