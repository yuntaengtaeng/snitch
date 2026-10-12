/** 변경 이유 요약 요청 프롬프트와 응답 해석 */

import type { FileChange } from '../work-files/git'

/** 변경 이유를 물을 파일 하나의 레포 기준 경로와 이번 턴의 변경 내용 */
export type ChangedFile = { path: string; diff: string }

/** 프롬프트에 넣을 변경 내용, 새 파일은 표시를 붙인 전체 내용 */
export function changeText(change: FileChange): string {
  return change.isNew ? `(새 파일)\n${change.text}` : change.text
}

export const REASON_SYSTEM = [
  '너는 코드 리뷰어를 돕는 요약가다. 각 파일을 왜 바꿨는지 짧은 명사구 한 줄로 적는다.',
  '규칙: 1) 명사로 끝냄 (~함, ~위해, ~합니다 금지) 2) 목적과 대상만, 군더더기 없이',
  '3) 마침표, 가운뎃점, 화살표, 따옴표, 이모지 금지 4) 지시대로 JSON 객체 하나만 출력',
  '좋은 예: "로그인 실패 시 재시도 안내 추가", "회의 결정과 할 일 공유용 회의록"',
  '나쁜 예: "주간 회의 결정 사항과 액션 아이템을 팀에 공유하기 위해", "README를 수정함."',
].join('\n')

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

/** 한 줄로 합치고 UI 금지 문자를 걷어 낸 변경 이유 */
export function tidyReason(text: string): string {
  return text
    .replace(/[←-⇿⟵-⟿]/g, ' ')
    .replace(/\s*[·•—–]\s*/g, ', ')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s.。,]+$/, '')
    .trim()
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
    const reason = tidyReason(value)
    if (reason) reasons.set(path, reason.length > maxChars ? `${reason.slice(0, maxChars - 1)}…` : reason)
  }
  return reasons
}
