/** 기억할 거리 보드의 할 일, 결정, 링크와 그 변경 규칙 */

export type Todo = { id: string; text: string; state: 'open' | 'active' | 'done' }

export type Decision = {
  id: string
  text: string
  /** 버튼으로 보여 줄 선택지, 없으면 직접 답하기만 */
  options: string[]
  /** 사용자가 보낸 답, Claude 가 닫기 전까지 표시 */
  answered?: string
}

export type Pin = { href: string; label: string }

export type Board = { todos: Todo[]; decisions: Decision[]; links: Pin[] }

/** Claude 가 board 도구로 보내는 변경 */
export type BoardUpdate = {
  add_todos?: string[]
  start_todo?: string
  done_todos?: string[]
  remove_todos?: string[]
  open_decisions?: { question: string; options?: string[] }[]
  decide?: string[]
}

export const EMPTY_BOARD: Board = { todos: [], decisions: [], links: [] }

/** 보드에 남기는 최대 링크 수 */
export const MAX_LINKS = 12

/** 한 결정의 최대 선택지 수 */
export const MAX_OPTIONS = 4

/** prefix 로 시작하는 id 중 가장 큰 번호 다음 id */
function nextId(prefix: string, ids: string[]): string {
  return prefix + (Math.max(0, ...ids.map(id => Number(id.slice(prefix.length)) || 0)) + 1)
}

/** board 도구 입력 해석, 모르는 형식의 값은 버림 */
export function parseUpdate(input: Record<string, unknown>): BoardUpdate {
  const strings = (v: unknown) =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim()) : undefined
  const decisions = Array.isArray(input['open_decisions'])
    ? input['open_decisions'].flatMap(d => {
        if (typeof d === 'string' && d.trim()) return [{ question: d.trim() }]
        const { question, options } = (d ?? {}) as { question?: unknown; options?: unknown }
        if (typeof question !== 'string' || !question.trim()) return []
        return [{ question: question.trim(), options: strings(options) }]
      })
    : undefined
  const start = input['start_todo']
  return {
    add_todos: strings(input['add_todos']),
    start_todo: typeof start === 'string' && start ? start : undefined,
    done_todos: strings(input['done_todos']),
    remove_todos: strings(input['remove_todos']),
    open_decisions: decisions,
    decide: strings(input['decide']),
  }
}

/** 변경을 반영한 보드, 진행 중 할 일은 하나만 */
export function applyUpdate(board: Board, change: BoardUpdate): Board {
  let todos = board.todos
  let decisions = board.decisions
  for (const text of change.add_todos ?? []) {
    todos = [...todos, { id: nextId('t', todos.map(t => t.id)), text, state: 'open' }]
  }
  for (const { question, options } of change.open_decisions ?? []) {
    const id = nextId('d', decisions.map(d => d.id))
    decisions = [...decisions, { id, text: question, options: (options ?? []).slice(0, MAX_OPTIONS) }]
  }

  const done = new Set(change.done_todos ?? [])
  const removed = new Set(change.remove_todos ?? [])
  todos = todos.filter(t => !removed.has(t.id)).map(t => (done.has(t.id) ? { ...t, state: 'done' as const } : t))
  if (change.start_todo) {
    todos = todos.map(t => {
      if (t.id === change.start_todo && t.state !== 'done') return { ...t, state: 'active' as const }
      return t.state === 'active' ? { ...t, state: 'open' as const } : t
    })
  }

  const decided = new Set(change.decide ?? [])
  decisions = decisions.filter(d => !decided.has(d.id))
  return { ...board, todos, decisions }
}

/** 사용자가 결정에 답했다는 표시를 남긴 보드 */
export function markAnswered(board: Board, id: string, answer: string): Board {
  return { ...board, decisions: board.decisions.map(d => (d.id === id ? { ...d, answered: answer } : d)) }
}

/** 새 링크를 앞에 두고 같은 주소는 하나만 남긴 보드 */
export function addLinks(board: Board, pins: Pin[]): Board {
  const rest = board.links.filter(p => !pins.some(n => n.href === p.href))
  return { ...board, links: [...pins, ...rest].slice(0, MAX_LINKS) }
}

/** 시스템 프롬프트에 붙일 지금 보드, id 포함 */
export function describeBoard(board: Board): string {
  if (board.todos.length + board.decisions.length === 0) return 'snitch 보드: 비어 있음'
  const mark = { open: ' ', active: '>', done: 'x' } as const
  return [
    'snitch 보드:',
    ...board.todos.map(t => `${t.id} [${mark[t.state]}] ${t.text}`),
    ...board.decisions.map(d => {
      const options = d.options.length > 0 ? ` (선택지: ${d.options.join(' / ')})` : ''
      const answered = d.answered ? ` (사용자 답: ${d.answered})` : ''
      return `${d.id} [?] ${d.text}${options}${answered}`
    }),
  ].join('\n')
}

/** 결정에 답할 때 보내는 사용자 요청, Claude 가 id 로 닫을 수 있게 앞에 붙임 */
export function answerText(decision: Decision, answer: string): string {
  return `[결정 ${decision.id}] ${decision.text}: ${answer.trim()}`
}

/** 대화창에 한 줄로 보여 줄 도구 호출 요약 */
export function updateSummary(change: BoardUpdate): string {
  const parts = [
    change.add_todos?.length && `할 일 +${change.add_todos.length}`,
    change.start_todo && `${change.start_todo} 시작`,
    change.done_todos?.length && `할 일 ${change.done_todos.length}개 완료`,
    change.remove_todos?.length && `할 일 -${change.remove_todos.length}`,
    change.open_decisions?.length && `결정 +${change.open_decisions.length}`,
    change.decide?.length && `결정 ${change.decide.length}개 닫음`,
  ].filter(Boolean)
  return `snitch 보드: ${parts.join(', ') || '변경 없음'}`
}

/** 응답 마지막 줄들이 사용자에게 묻는 질문으로 끝나는지 여부, 코드 블록 제외 */
export function asksUser(reply: string): boolean {
  const prose = reply.replace(/```[\s\S]*?```/g, '')
  const lines = prose
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(-3)
  return lines.some(l => /[?？][*_`)"'\]]*$/.test(l))
}

const MAKES_COMMAND = new RegExp(
  [
    /\bgh\s+(?:(?:pr|issue|release|repo|gist)\s+create|(?:pr|issue)\s+comment)\b/.source,
    /\bgit\s+push\b/.source,
    /\bvercel\s+(?:deploy\b|--prod\b)|\bnetlify\s+deploy\b|\bfirebase\s+deploy\b|\bwrangler\s+(?:pages\s+)?deploy\b/.source,
  ].join('|'),
)
const MAKES_MCP = /^mcp__.*(?:create|draft|send|publish|share|upload)/i
const DOCS_BATCH = /^mcp__.*Claude_Docs__batch$/

/** 무언가를 만드는 툴 호출인지 여부, 읽기와 검색과 기존 문서 수정은 제외 */
export function makesSomething(tool: string, input: Record<string, unknown>): boolean {
  if (tool === 'Bash') return typeof input['command'] === 'string' && MAKES_COMMAND.test(input['command'])
  if (tool === 'Artifact') return (input['action'] ?? 'publish') === 'publish' && input['asset'] !== true
  if (DOCS_BATCH.test(tool)) {
    const container = input['container'] as { create?: unknown } | undefined
    return typeof container === 'object' && container !== null && container.create !== undefined
  }
  return MAKES_MCP.test(tool)
}

const URL_PATTERN = /https:\/\/[A-Za-z0-9.-]+(?::\d+)?(?:\/[A-Za-z0-9\-._~:/?#[\]!$&'()*+,;=%@]*)?/g

/** 링크의 짧은 이름, GitHub PR 과 이슈, Claude 아티팩트는 알아보기 쉽게 */
export function pinLabel(href: string): string {
  const gh = /github\.com\/[^/]+\/([^/]+)\/(pull|issues)\/(\d+)/.exec(href)
  if (gh) return `${gh[1]} ${gh[2] === 'pull' ? 'PR' : '이슈'} #${gh[3]}`
  const artifact = /claude\.ai\/(?:code\/)?artifact\/([A-Za-z0-9-]+)/.exec(href)
  if (artifact) return `아티팩트 ${(artifact[1] ?? '').slice(0, 8)}`
  return href.slice('https://'.length)
}

/** 툴 결과 글에서 꺼낸 링크, 중복과 메일 주소와 git 원격 주소(.git) 제외 */
export function urlPins(text: string): Pin[] {
  const hrefs = [...new Set([...text.matchAll(URL_PATTERN)].map(m => m[0].replace(/[)\].,;:'!?*]+$/, '')))]
  return hrefs
    .filter(href => !href.includes('@') && !href.endsWith('.git') && href.length <= 2048)
    .map(href => ({ href, label: pinLabel(href) }))
}
