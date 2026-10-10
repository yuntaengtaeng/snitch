/** 변경 이유 요약 요청 프롬프트와 응답 해석 */

/** 변경 이유를 물을 파일 하나의 레포 기준 경로와 HEAD 대비 변경 내용 */
export type ChangedFile = { path: string; diff: string }

export const REASON_SYSTEM =
  '너는 코드 리뷰어를 돕는 요약가다. 각 파일을 무엇을 바꿨는지가 아니라 왜 바꿨는지 한 줄로 설명한다. 지시대로 JSON 객체 하나만 출력한다.'

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…(생략)`
}

/** 한 턴에서 바뀐 파일들의 변경 이유를 한 번에 묻는 프롬프트 */
export function reasonPrompt(
  request: string,
  answer: string,
  files: ChangedFile[],
  limits: { diffChars: number; reasonChars: number },
): string {
  const perFile = Math.max(400, Math.floor(limits.diffChars / Math.max(1, files.length)))
  const diffs = files.map(f => `=== ${f.path} ===\n${clip(f.diff, perFile)}`).join('\n\n')
  return [
    `사용자 요청:\n${clip(request.trim() || '(없음)', 2000)}`,
    `Claude의 마지막 답변:\n${clip(answer.trim() || '(없음)', 2000)}`,
    `바뀐 파일과 diff:\n${diffs}`,
    `각 파일을 왜 바꿨는지 한국어 한 줄(${limits.reasonChars}자 이내)로 적어라.` +
      ' 키는 위 파일 경로 그대로, 값은 이유인 JSON 객체 하나만 출력한다.',
  ].join('\n\n')
}

/** 모델 응답 JSON 에서 꺼낸 파일별 변경 이유, 묻지 않은 경로와 빈 값 제외 */
export function parseReasons(text: string, paths: string[], maxChars: number): Map<string, string> {
  const reasons = new Map<string, string>()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return reasons

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return reasons
  }
  if (typeof parsed !== 'object' || parsed === null) return reasons

  const asked = new Set(paths)
  for (const [path, value] of Object.entries(parsed)) {
    if (!asked.has(path) || typeof value !== 'string') continue
    const line = value.replace(/\s+/g, ' ').trim()
    if (line) reasons.set(path, line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line)
  }
  return reasons
}
