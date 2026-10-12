import type { Elements, RenderChildren } from 'claude-code'

import * as R from '../agents/roster'
import type { AgentsView } from '../agents/tracker'
import * as C from '../config'
import { splitPath } from '../paths'
import { latestReason, type ReasonsView } from '../reasons/tracker'
import { limitGauge, type LimitGauge, type RateLimit } from '../status-line/text'
import type { WorkFilesView } from '../work-files/tracker'
import * as V from '../work-files/view'

export type DashboardView = {
  agents: AgentsView
  files: WorkFilesView
  reasons: ReasonsView
  /** 요금제 한도 사용률, 구독 요금제가 아니면 빈 배열 */
  limits: readonly RateLimit[]
}

type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'>

const STATE_COLOR: Record<R.AgentState, 'inactive' | 'warning' | 'success' | 'error'> = {
  waiting: 'inactive',
  working: 'warning',
  done: 'success',
  error: 'error',
}

const EXPLAINING_TEXT = '변경 이유 정리 중…'

const GAUGE_COLOR: Record<LimitGauge['level'], 'success' | 'warning' | 'error'> = {
  plenty: 'success',
  half: 'warning',
  low: 'error',
}

function gaugesOf(view: DashboardView): LimitGauge[] {
  const now = Date.now()
  return view.limits.map(l => limitGauge(l, C.LIMIT_BAR_SEGMENTS, now))
}

/** 파일 하나의 변경 이유와 위치, 요약 중이면 요약 중 문구 */
function noteOf(view: DashboardView, path: string): V.FileNote & { isExplaining: boolean } {
  const latest = latestReason(view.reasons, path)
  const editorId = view.files.editedBy.get(path)
  const isExplaining = latest === undefined && view.reasons.explaining.has(path)
  return {
    reason: latest ?? (isExplaining ? EXPLAINING_TEXT : undefined),
    place: V.placeOf(path, editorId ? view.agents.taskOf(editorId) : ''),
    isExplaining,
  }
}

/** 에이전트 구역을 보여 줄지 여부, 서브에이전트가 있을 때만 */
function showsAgents(view: DashboardView): boolean {
  return R.hasSubagents(view.agents.agents)
}

/** /snitch text 와 좁은 화면용 텍스트 버전 */
export function dashboardText(view: DashboardView): string {
  const limits = gaugesOf(view)
    .map(g => `${g.label} ${g.remaining}% 남음${g.reset ? `, ${g.reset} 초기화` : ''}`)
    .join(', ')
  const header = limits
  const agents = showsAgents(view) ? R.agentsText(view.agents.agents, view.agents.now) : ''
  const files = V.filesText(view.files.commits, view.files.current, path => noteOf(view, path))
  return [header, agents, files].filter(Boolean).join('\n\n')
}

/** 패널을 열 때 요청할 줄 수 */
export function dashboardRows(view: DashboardView): number {
  const noteLines = view.files.current.reduce((n, f) => {
    const { reason, place } = noteOf(view, f.path)
    return n + (reason ? 1 : 0) + (place ? 1 : 0)
  }, 0)
  const agentRows = showsAgents(view) ? R.agentsRows(view.agents.agents) : 0
  const rows = 2 + agentRows + V.filesRows(view.files.commits, view.files.current, noteLines)
  return Math.min(rows, C.PANE_MAX_ROWS)
}

/** 에이전트, 변경 파일, 커밋 구역으로 된 대시보드 패널, 파일 행을 누르면 상세 화면 */
export function renderDashboard(ui: Ui, view: DashboardView, width: number, actions: { openFile: (path: string) => void }) {
  const { Box, Text, Button } = ui
  const { agents, files } = view
  const { commits, current } = files
  const all = V.totalsOf(current)
  /** 제목 줄에 한도 초기화 시각을 붙일 만큼 넓은지 여부 */
  const showsReset = width >= C.RESET_MIN_COLUMNS

  /** +추가 −삭제, 0 이거나 dim 이면 흐리게 */
  const stat = (f: { added: number | null; deleted: number | null }, dim = false) =>
    f.added === null || f.deleted === null ? (
      <Text color="inactive">bin</Text>
    ) : (
      <Text>
        <Text color={dim || f.added === 0 ? 'inactive' : 'diffAddedWord'}>{`+${f.added}`}</Text>
        <Text> </Text>
        <Text color={dim || f.deleted === 0 ? 'inactive' : 'diffRemovedWord'}>{`−${f.deleted}`}</Text>
      </Text>
    )

  /** 왼쪽은 남는 너비를 채우고 오른쪽은 끝에 붙는 한 줄 */
  const row = (key: string, left: RenderChildren, right: RenderChildren) => (
    <Box key={key} flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        {left}
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        {right}
      </Box>
    </Box>
  )

  /** 들여 쓴 보조 한 줄 */
  const detail = (key: string, text: string, color?: 'inactive', italic = false) => (
    <Box key={key} paddingLeft={2}>
      <Text color={color} italic={italic} wrap="truncate-end">
        {text}
      </Text>
    </Box>
  )

  /** 개수가 붙은 구역 제목, right 는 오른쪽 끝에 붙는 요약 */
  const section = (key: string, title: string, count: number, right?: RenderChildren) => (
    <Box key={key} marginTop={1} flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        <Text bold>{title}</Text>
        <Text color="inactive">{` ${count}`}</Text>
      </Box>
      {right ? (
        <Box flexShrink={0} marginLeft={1}>
          {right}
        </Box>
      ) : (
        <Text />
      )}
    </Box>
  )

  const agentRows = agents.agents.map(a => (
    <Box key={`a-${a.id}`} flexDirection="column">
      {row(
        `ar-${a.id}`,
        <Text wrap="truncate-end">
          <Text color={STATE_COLOR[a.state]}>{R.STATE_ICON[a.state]}</Text>
          <Text bold={a.state === 'working'} color={a.state === 'waiting' ? 'inactive' : undefined}>
            {` ${R.titleOf(a)}`}
          </Text>
        </Text>,
        <Text color="inactive">{R.timeText(a, agents.now)}</Text>,
      )}
      {R.detailLines(a).map((line, i) => detail(`ad-${a.id}-${i}`, line, 'inactive'))}
    </Box>
  ))

  const fileRows = current.map(f => {
    const name = splitPath(f.path).name
    const letter = V.statusLetter(f)
    const { reason, place, isExplaining } = noteOf(view, f.path)
    const reasonCount = view.reasons.history.get(f.path)?.length ?? 0
    return (
      <Box key={`f-${f.path}`} flexDirection="column">
        {row(
          `fr-${f.path}`,
          <Button key={`open:${f.path}`} plain onPress={() => actions.openFile(f.path)}>
            <Text color={letter === 'A' ? 'success' : 'inactive'}>{letter}</Text>
            <Text> </Text>
            <Text bold>{name}</Text>
            {f.otherSessions ? <Text color="warning">{`  ${V.CONFLICT_LABEL}`}</Text> : <Text />}
          </Button>,
          stat(f),
        )}
        {reason ? (
          <Box key={`fn-${f.path}`} paddingLeft={2}>
            <Text wrap="truncate-end">
              <Text color={isExplaining ? 'inactive' : undefined} italic={isExplaining}>
                {reason}
              </Text>
              <Text color="inactive">{reasonCount > 1 ? `  이력 ${reasonCount}` : ''}</Text>
            </Text>
          </Box>
        ) : (
          <Text />
        )}
        {place ? detail(`fp-${f.path}`, place, 'inactive') : <Text />}
      </Box>
    )
  })

  const commitRows = commits.map(c =>
    row(
      `c-${c.hash}`,
      <Text color="inactive" wrap="truncate-end">{`● ${c.hash} ${c.subject}`}</Text>,
      stat(V.totalsOf(c.files), true),
    ),
  )

  return (
    <Box flexDirection="column" paddingX={1} backgroundColor={C.PANE_BACKGROUND ?? undefined}>
      {row(
        'header',
        <Text bold>snitch</Text>,
        <Text>
          {gaugesOf(view).map((g, i) => (
            <Text key={`g-${g.label}`}>
              <Text color="inactive">{`${i > 0 ? '  ' : ''}${g.label} `}</Text>
              <Text color={GAUGE_COLOR[g.level]}>{g.bar}</Text>
              <Text color="inactive">{` ${g.remaining}%`}</Text>
              <Text color="subtle">{showsReset && g.reset ? ` ${g.reset}` : ''}</Text>
            </Text>
          ))}
        </Text>,
      )}
      <Text key="divider" color="inactive">
        {'─'.repeat(Math.max(1, width - 2))}
      </Text>
      {showsAgents(view) ? section('s-agents', '에이전트', agents.agents.length) : <Text key="na" />}
      {showsAgents(view) ? agentRows : <Text key="nar" />}
      {section('s-files', '변경 파일', current.length, current.length > 0 ? stat(all) : undefined)}
      {current.length === 0 ? (
        <Text key="empty" color="inactive">
          없음
        </Text>
      ) : (
        fileRows
      )}
      {commits.length > 0 ? section('s-commits', '커밋', commits.length) : <Text key="nc" />}
      {commitRows}
    </Box>
  )
}
