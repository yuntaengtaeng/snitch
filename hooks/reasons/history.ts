/** 파일 하나의 요청별 변경 이유 이력 */

export type ReasonEntry = {
  /** 사용자 요청 순번, 같은 요청 안의 이유는 한 항목으로 합침 */
  requestId: number
  /** 이유의 근거가 된 사용자 요청 */
  request: string
  reason: string
  /** note 는 고친 Claude 가 남긴 메모, summary 는 모델 요약 */
  source: 'note' | 'summary'
}

/** 파일 하나에 남기는 최대 이력 수 */
export const MAX_HISTORY = 10

/** 새 이유를 더한 이력, 같은 요청의 항목은 교체하되 작성자 메모를 요약으로 덮지 않음 */
export function addEntry(entries: readonly ReasonEntry[], next: ReasonEntry): ReasonEntry[] {
  const last = entries[entries.length - 1]
  if (last && last.requestId === next.requestId) {
    if (last.source === 'note' && next.source === 'summary') return [...entries]
    return [...entries.slice(0, -1), next]
  }
  return [...entries, next].slice(-MAX_HISTORY)
}

/** 마지막 항목의 이유만 바꾼 이력, 비어 있으면 새 항목 추가 */
export function replaceLatest(entries: readonly ReasonEntry[], fallback: ReasonEntry): ReasonEntry[] {
  const last = entries[entries.length - 1]
  if (!last) return [fallback]
  return [...entries.slice(0, -1), { ...last, reason: fallback.reason, source: fallback.source }]
}

/** 화면 한 줄용 요청 문구, 줄바꿈과 연속 공백을 합치고 max 글자에서 자름 */
export function requestLine(request: string, max: number): string {
  const line = request.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** /snitch why <파일> 용 이력 텍스트, 오래된 요청부터 번호 */
export function historyText(path: string, entries: readonly ReasonEntry[]): string {
  if (entries.length === 0) return `${path}\n  남은 변경 이유 없음`
  const lines = [path]
  entries.forEach((e, i) => {
    lines.push(`  ${i + 1} ${e.reason}`)
    if (e.request) lines.push(`    요청: ${requestLine(e.request, 60)}`)
  })
  return lines.join('\n')
}
