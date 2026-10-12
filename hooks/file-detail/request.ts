import type { DiffPart } from './diff'

/** 파일 상세에서 보내는 수정 요청 문구와 모델에게만 붙이는 맥락 */

/** 사용자에게 보이는 수정 요청, 앞에 경로와 줄 범위 */
export function editRequestText(path: string, part: DiffPart, instruction: string): string {
  return `[${path} ${part.range}] ${instruction.trim()}`
}

/** 요청 대상 변경 조각, 모델이 지금 상태와 바꾼 내용을 바로 보게 함 */
export function editRequestContext(path: string, part: DiffPart): string {
  const fence = part.format === 'diff' ? '```diff' : '```'
  const what = part.format === 'diff' ? 'HEAD 대비 변경 부분' : '새 파일 내용'
  return [`사용자가 snitch 파일 상세에서 고른 ${path} 의 ${what} (${part.range})`, fence, part.code, '```'].join('\n')
}
