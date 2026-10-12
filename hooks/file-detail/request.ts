import type { DiffPart } from './diff'

/** 사용자에게 보이는 수정 요청, 앞에 경로와 줄 범위 */
export function editRequestText(path: string, part: DiffPart, instruction: string): string {
  return `[${path} ${part.range}] ${instruction.trim()}`
}
