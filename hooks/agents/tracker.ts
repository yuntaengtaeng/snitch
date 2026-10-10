import * as C from '../config'
import type { Host } from '../host'
import * as R from './roster'

const KEEP_MS = C.AGENT_KEEP_FINISHED_SEC * 1000

export type AgentsView = {
  agents: R.AgentEntry[]
  /** 경과 시간 계산 기준 시각(ms) */
  now: number
  /** 에이전트 id 의 작업 이름, 메인 대화나 모르는 id 면 빈 문자열 */
  taskOf: (id: string) => string
}

/** 메인 대화와 서브에이전트의 상태, 마지막 활동 추적 */
export function createAgents(deps: { getHost: () => Host | null; onChange: () => void }) {
  let roster: R.AgentEntry[] = []
  /** 목록에서 빠진 뒤에도 파일 표시에 쓰는 서브에이전트별 작업 이름 */
  const tasks = new Map<string, string>()
  let now = 0

  async function syncClock() {
    const host = deps.getHost()
    if (host) now = await host.now()
  }

  return {
    async clear() {
      await syncClock()
      roster = [R.mainAgent(now)]
      tasks.clear()
    },

    async turnStarted() {
      await syncClock()
      roster = R.withState(roster, R.MAIN_ID, 'working', now)
      deps.onChange()
    },

    /** turn.complete 의 agentId 와 reason 에 따른 상태 갱신 */
    async turnEnded(agentId: string | undefined, reason: string) {
      await syncClock()
      const state = R.stateAfterTurn(reason, agentId === undefined)
      roster = R.withState(roster, agentId ?? R.MAIN_ID, state, now)
      deps.onChange()
    },

    async spawned(spawn: { id: string; name: string; task: string }) {
      await syncClock()
      roster = R.withSpawned(roster, spawn, now)
      tasks.set(spawn.id, spawn.task)
      deps.onChange()
    },

    acted(agentId: string | undefined, tool: string, input: Record<string, unknown>) {
      roster = R.withActivity(roster, agentId ?? R.MAIN_ID, R.activityOf(tool, input))
      deps.onChange()
    },

    /** $.agent.list() 로 상태를 맞추고 경과 시간 갱신, 끝난 지 오래된 서브에이전트 제거 */
    async tick() {
      const host = deps.getHost()
      if (!host || !R.needsTick(roster)) return
      await syncClock()
      roster = R.withListed(roster, await host.listAgents().catch(() => []), now)
      roster = R.withoutExpired(roster, now, KEEP_MS)
      deps.onChange()
    },

    view: (): AgentsView => ({
      agents: R.visibleAgents(roster, now, KEEP_MS),
      now,
      taskOf: id => tasks.get(id) ?? '',
    }),
  }
}
