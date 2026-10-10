/** 대시보드 에이전트 목록의 상태 전이와 표시 문구 */

export type AgentState = 'waiting' | 'working' | 'done' | 'error'

export type AgentEntry = {
  /** $.agent.list() 의 id, 메인 대화는 MAIN_ID */
  id: string
  /** Agent 툴의 name, 없으면 서브에이전트 타입 */
  name: string
  /** Agent 툴의 description, 메인 대화는 빈 문자열 */
  task: string
  state: AgentState
  /** 현재 상태로 바뀐 시각(ms) */
  since: number
  /** 마지막 툴 호출 요약, 없으면 null */
  activity: string | null
}

export const MAIN_ID = 'main'

export const STATE_LABEL: Record<AgentState, string> = {
  waiting: '대기',
  working: '작업 중',
  done: '완료',
  error: '오류',
}

export function mainAgent(at: number): AgentEntry {
  return { id: MAIN_ID, name: 'main', task: '', state: 'waiting', since: at, activity: null }
}

/** 새로 시작한 서브에이전트를 작업 중 상태로 추가한 목록 */
export function withSpawned(
  roster: AgentEntry[],
  spawn: { id: string; name: string; task: string },
  at: number,
): AgentEntry[] {
  const entry: AgentEntry = { ...spawn, state: 'working', since: at, activity: null }
  return [...roster.filter(a => a.id !== spawn.id), entry]
}

/** id 에이전트의 상태를 바꾼 목록, 같은 상태면 그대로 */
export function withState(roster: AgentEntry[], id: string, state: AgentState, at: number): AgentEntry[] {
  return roster.map(a => (a.id === id && a.state !== state ? { ...a, state, since: at } : a))
}

/** id 에이전트의 마지막 활동을 바꾼 목록 */
export function withActivity(roster: AgentEntry[], id: string, activity: string): AgentEntry[] {
  return roster.map(a => (a.id === id ? { ...a, activity } : a))
}

/** $.agent.list() 상태값의 대시보드 상태, 모르는 값은 null */
export function stateOfStatus(status: string): AgentState | null {
  switch (status) {
    case 'pending':
    case 'waiting':
    case 'idle':
      return 'waiting'
    case 'running':
      return 'working'
    case 'completed':
      return 'done'
    case 'failed':
    case 'killed':
      return 'error'
    default:
      return null
  }
}

/** $.agent.list() 결과로 이미 아는 에이전트의 상태를 맞춘 목록 */
export function withListed(
  roster: AgentEntry[],
  listed: { id: string; status: string }[],
  at: number,
): AgentEntry[] {
  return listed.reduce((acc, { id, status }) => {
    const state = stateOfStatus(status)
    return state ? withState(acc, id, state, at) : acc
  }, roster)
}

/** turn.complete 의 reason 에 따른 턴 종료 후 상태, 메인 대화는 완료 대신 대기 */
export function stateAfterTurn(reason: string, isMain: boolean): AgentState {
  if (reason === 'error' || reason === 'refusal') return 'error'
  if (isMain) return 'waiting'
  return reason === 'answer' ? 'done' : 'error'
}

/** 표시할 에이전트 목록: 메인 대화, 진행 중인 에이전트, 최근 끝난 에이전트 maxFinished 개 순서 */
export function visibleAgents(roster: AgentEntry[], maxFinished: number): AgentEntry[] {
  const isFinished = (a: AgentEntry) => a.state === 'done' || a.state === 'error'
  const main = roster.filter(a => a.id === MAIN_ID)
  const active = roster.filter(a => a.id !== MAIN_ID && !isFinished(a))
  const finished = roster
    .filter(a => a.id !== MAIN_ID && isFinished(a))
    .sort((a, b) => b.since - a.since)
    .slice(0, maxFinished)
  return [...main, ...active, ...finished]
}

/** 툴 호출 하나의 요약 문구 (예: Write a.md, Bash npm test) */
export function activityOf(tool: string, input: Record<string, unknown>): string {
  const path = input['file_path'] ?? input['notebook_path']
  if (typeof path === 'string') return `${tool} ${path.split(/[\\/]/).pop() ?? path}`
  for (const key of ['command', 'pattern', 'url', 'description']) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return `${tool} ${value.trim().split('\n')[0]}`
  }
  return tool
}

/** 경과 시간 문구 (예: 11초, 1분 12초, 1시간 3분) */
export function durationText(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000))
  if (sec < 60) return `${sec}초`
  const min = Math.floor(sec / 60)
  if (min < 60) return sec % 60 ? `${min}분 ${sec % 60}초` : `${min}분`
  return min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${Math.floor(min / 60)}시간`
}

/** 에이전트 한 줄 상태 문구 (예: 작업 중, 11초, Write a.md / 완료, 30초 전) */
export function statusLine(a: AgentEntry, now: number): string {
  const label = STATE_LABEL[a.state]
  const elapsed = now - a.since
  if (a.state === 'working') {
    return [label, durationText(elapsed), a.activity].filter(Boolean).join(', ')
  }
  if (a.state === 'waiting') return label
  return `${label}, ${elapsed < 10_000 ? '방금' : `${durationText(elapsed)} 전`}`
}

/** 에이전트 구역의 텍스트 버전 */
export function agentsText(agents: AgentEntry[], now: number): string {
  const lines = ['에이전트']
  for (const a of agents) {
    lines.push(`  ${a.name}${a.task ? `  ${a.task}` : ''}`)
    lines.push(`    ${statusLine(a, now)}`)
  }
  return lines.join('\n')
}

/** 에이전트 구역의 예상 줄 수 */
export function agentsRows(agents: AgentEntry[]): number {
  return 2 + agents.length * 2
}
