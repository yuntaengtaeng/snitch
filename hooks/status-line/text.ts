/** 상태줄 문구 */

export type RateLimit = { kind: string; percentUsed: number }

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

/** 상태줄 문자열 */
export function statusText(input: {
  model?: string | null
  effort?: string | null
  rateLimits: RateLimit[]
  editedFiles: number
  commands: number
}): string {
  const parts: string[] = []

  if (input.model) {
    parts.push(input.effort ? `${shortModelName(input.model)} · ${input.effort}` : shortModelName(input.model))
  }

  const limits = input.rateLimits
    .map(r => `${LIMIT_LABEL[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%`)
    .join(' · ')
  if (limits) parts.push(`한도 ${limits}`)

  parts.push(`세션 편집 ${input.editedFiles}파일 · 명령 ${input.commands}회`)

  return parts.join('  |  ')
}
