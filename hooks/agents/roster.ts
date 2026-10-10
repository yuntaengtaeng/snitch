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
  /** 마지막으로 작업 중이 된 시각(ms) */
  startedAt: number
  /** 마지막 툴 호출 요약, 없으면 null */
  activity: string | null
}

export const MAIN_ID = 'main'

export const STATE_ICON: Record<AgentState, string> = {
  waiting: '○',
  working: '●',
  done: '✓',
  error: '✕',
}

export function mainAgent(at: number): AgentEntry {
  return { id: MAIN_ID, name: 'main', task: '', state: 'waiting', since: at, startedAt: at, activity: null }
}

/** 새로 시작한 서브에이전트를 작업 중 상태로 추가한 목록 */
export function withSpawned(
  roster: AgentEntry[],
  spawn: { id: string; name: string; task: string },
  at: number,
): AgentEntry[] {
  const entry: AgentEntry = { ...spawn, state: 'working', since: at, startedAt: at, activity: null }
  return [...roster.filter(a => a.id !== spawn.id), entry]
}

/** id 에이전트의 상태를 바꾼 목록, 같은 상태면 그대로, 작업 중이 되면 시작 시각과 활동 초기화 */
export function withState(roster: AgentEntry[], id: string, state: AgentState, at: number): AgentEntry[] {
  return roster.map(a => {
    if (a.id !== id || a.state === state) return a
    return state === 'working'
      ? { ...a, state, since: at, startedAt: at, activity: null }
      : { ...a, state, since: at }
  })
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

function isFinished(a: AgentEntry): boolean {
  return a.state === 'done' || a.state === 'error'
}

/** 끝난 지 keepMs 가 지난 서브에이전트를 뺀 목록 */
export function withoutExpired(roster: AgentEntry[], now: number, keepMs: number): AgentEntry[] {
  return roster.filter(a => a.id === MAIN_ID || !isFinished(a) || now - a.since < keepMs)
}

/** 상태 확인이 필요한 에이전트가 있는지 여부, 작업 중이거나 아직 사라지지 않은 끝난 에이전트 */
export function needsTick(roster: AgentEntry[]): boolean {
  return roster.some(a => a.state === 'working' || (a.id !== MAIN_ID && isFinished(a)))
}

/** 표시 순서의 에이전트 목록, 메인 대화, 진행 중, 끝난 지 keepMs 안 된 에이전트 순 */
export function visibleAgents(roster: AgentEntry[], now: number, keepMs: number): AgentEntry[] {
  const shown = withoutExpired(roster, now, keepMs)
  const main = shown.filter(a => a.id === MAIN_ID)
  const active = shown.filter(a => a.id !== MAIN_ID && !isFinished(a))
  const finished = shown.filter(a => a.id !== MAIN_ID && isFinished(a)).sort((a, b) => b.since - a.since)
  return [...main, ...active, ...finished]
}

/** 명령 속 경로를 파일 이름만 남긴 문구 (cat /c/r/notes/a.md 는 cat a.md) */
export function shortenPaths(text: string): string {
  return text.replace(/(?:[A-Za-z]:)?(?:[\\/][^\s'"\\/]+)+[\\/]([^\s'"\\/]+)/g, '$1')
}

/** 툴 호출 하나의 요약 문구 (예: Write a.md, cat a.md, Grep TODO) */
export function activityOf(tool: string, input: Record<string, unknown>): string {
  const path = input['file_path'] ?? input['notebook_path']
  if (typeof path === 'string') return `${tool} ${path.split(/[\\/]/).pop() ?? path}`
  const command = input['command']
  if (typeof command === 'string' && command.trim()) return shortenPaths(command.trim().split('\n')[0] ?? '')
  for (const key of ['pattern', 'url', 'description']) {
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

/** 에이전트 제목, 서브에이전트는 작업 이름, 메인 대화는 main */
export function titleOf(a: AgentEntry): string {
  return a.task || a.name
}

/** 오른쪽에 붙는 시간, 작업 중이면 경과 시간, 끝났으면 걸린 시간, 대기면 빈 문자열 */
export function timeText(a: AgentEntry, now: number): string {
  if (a.state === 'waiting') return ''
  return durationText((a.state === 'working' ? now : a.since) - a.startedAt)
}

/** 제목 아래에 들여 쓰는 줄, 작업 중일 때 마지막 활동 */
export function detailLines(a: AgentEntry): string[] {
  return a.state === 'working' && a.activity ? [a.activity] : []
}

/** 에이전트 구역의 텍스트 버전 */
export function agentsText(agents: AgentEntry[], now: number): string {
  const lines = [`에이전트 ${agents.length}`]
  for (const a of agents) {
    lines.push(`  ${STATE_ICON[a.state]} ${titleOf(a)}  ${timeText(a, now)}`.trimEnd())
    for (const d of detailLines(a)) lines.push(`    ${d}`)
  }
  return lines.join('\n')
}

/** 에이전트 구역의 예상 줄 수 */
export function agentsRows(agents: AgentEntry[]): number {
  return 2 + agents.reduce((n, a) => n + 1 + detailLines(a).length, 0)
}
