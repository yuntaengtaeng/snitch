import { MAIN_ID, type AgentEntry } from '../agents/roster'
import type { Board } from '../board/board'
import { doneCount } from '../board/view'
import type { Screen } from './navigation'

/** 패널 화면 제목, 아이콘, 개수처럼 패널과 아이콘 줄이 함께 쓰는 정의 */

export type ListScreen = Exclude<Screen, 'home'>

export const SCREEN_TITLE: Record<ListScreen, string> = {
  files: '변경 파일',
  todos: '할 일',
  decisions: '결정',
  agents: '에이전트',
  links: '링크',
}

/** 아이콘 줄의 순서와 기호 */
export const SCREEN_ICONS: { screen: ListScreen; icon: string }[] = [
  { screen: 'files', icon: '±' },
  { screen: 'todos', icon: '✓' },
  { screen: 'decisions', icon: '?' },
  { screen: 'agents', icon: '●' },
  { screen: 'links', icon: '⧉' },
]

export const HOME_ICON = '⌂'

/** 화면마다 붙는 개수, 할 일은 완료 수와 전체 수, 결정은 답하지 않은 수, 에이전트는 서브에이전트 수 */
export function screenCounts(input: {
  files: number
  board: Board
  agents: readonly AgentEntry[]
}): Record<ListScreen, string> {
  const { todos, decisions, links } = input.board
  return {
    files: String(input.files),
    todos: todos.length > 0 ? `${doneCount(todos)}/${todos.length}` : '0',
    decisions: String(decisions.filter(d => !d.answered).length),
    agents: String(input.agents.filter(a => a.id !== MAIN_ID).length),
    links: String(links.length),
  }
}

/** 명령 없이 연 패널을 엔진이 대화 옆에 배치하는 화면인지 여부, 전체화면이면서 minColumns 칸 이상 */
export function isWideViewport(viewport: { columns: number; isFullscreen?: boolean } | undefined, minColumns: number): boolean {
  return viewport?.isFullscreen === true && viewport.columns >= minColumns
}
