import type { Board, Decision, Todo } from './board'

/** 보드 구역의 진행 막대, 텍스트 버전, 줄 수 */

export const TODO_ICON: Record<Todo['state'], string> = { active: '▸', open: '○', done: '✓' }

/** 완료 비율 막대, segments 칸 */
export function progressBar(done: number, total: number, segments: number): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * segments)
  return '▰'.repeat(filled) + '▱'.repeat(segments - filled)
}

/** 완료되지 않은 할 일, 진행 중이 맨 앞 */
export function openTodos(todos: readonly Todo[]): Todo[] {
  return [...todos.filter(t => t.state === 'active'), ...todos.filter(t => t.state === 'open')]
}

export function doneCount(todos: readonly Todo[]): number {
  return todos.filter(t => t.state === 'done').length
}

/** 결정 하나의 답 상태 문구, 답하지 않았으면 빈 문자열 */
export function answeredText(d: Decision): string {
  return d.answered ? `답변 보냄, ${d.answered}` : ''
}

/** 상태줄용 보드 요약, 할 일 진행률과 답하지 않은 결정 수, 둘 다 없으면 빈 배열 */
export function boardStatusParts(board: Board): string[] {
  const parts: string[] = []
  if (board.todos.length > 0) parts.push(`할 일 ${doneCount(board.todos)}/${board.todos.length}`)
  const pending = board.decisions.filter(d => !d.answered).length
  if (pending > 0) parts.push(`결정 ${pending}개`)
  return parts
}

export function isBoardEmpty(board: Board): boolean {
  return board.todos.length + board.decisions.length + board.links.length === 0
}

/** /snitch text 용 보드 텍스트, 비었으면 빈 문자열 */
export function boardText(board: Board): string {
  const lines: string[] = []
  if (board.decisions.length > 0) {
    lines.push(`결정 필요 ${board.decisions.length}`)
    for (const d of board.decisions) {
      lines.push(`  ? ${d.text}`)
      if (d.options.length > 0) lines.push(`    선택지: ${d.options.join(', ')}`)
      if (d.answered) lines.push(`    ${answeredText(d)}`)
    }
  }
  if (board.todos.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`할 일 ${doneCount(board.todos)}/${board.todos.length}`)
    for (const t of openTodos(board.todos)) lines.push(`  ${TODO_ICON[t.state]} ${t.text}`)
    const done = doneCount(board.todos)
    if (done > 0) lines.push(`  ✓ ${done}개 완료`)
  }
  if (board.links.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`링크 ${board.links.length}`)
    for (const p of board.links) lines.push(`  ${p.label}  ${p.href}`)
  }
  return lines.join('\n')
}
