import type { Elements, RenderChildren } from 'claude-code'

import * as R from '../agents/roster'
import type { AgentsView } from '../agents/tracker'
import type { BoardView } from '../board/tracker'
import * as BV from '../board/view'
import * as C from '../config'
import { splitPath } from '../paths'
import { latestReason, type ReasonsView } from '../reasons/tracker'
import { renderDecisions, renderLinks, renderTodos, type BoardActions, type BoardUi } from './board-section'
import type { NavigationView, Screen } from './navigation'
import { SCREEN_TITLE, screenCounts, type ListScreen } from './screens'
import { limitGauge, type LimitGauge, type RateLimit } from '../status-line/text'
import type { WorkFilesView } from '../work-files/tracker'
import * as V from '../work-files/view'

export type DashboardView = {
  agents: AgentsView
  board: BoardView
  files: WorkFilesView
  reasons: ReasonsView
  /** 요금제 한도 사용률, 구독 요금제가 아니면 빈 배열 */
  limits: readonly RateLimit[]
  nav: NavigationView
}

export type DashboardActions = BoardActions & {
  openFile: (path: string) => void
  go: (screen: Screen) => void
  /** 사이드바를 닫고 입력창 위 아이콘 줄로 접기 */
  fold: () => void
}

type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'> & BoardUi

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

/** 칸 구역 줄 수, 위 여백과 테두리를 포함한 두 줄짜리 칸 */
const TILE_ROWS = 5

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

/** 메인 대화를 뺀 서브에이전트 */
function subagents(view: DashboardView): R.AgentEntry[] {
  return view.agents.agents.filter(a => a.id !== R.MAIN_ID)
}

/** 칸과 아이콘 줄에 붙는 개수 */
export function countsOf(view: DashboardView): Record<ListScreen, string> {
  return screenCounts({ files: view.files.current.length, board: view.board.board, agents: view.agents.agents })
}

/** /snitch text 와 좁은 화면용 텍스트 버전 */
export function dashboardText(view: DashboardView): string {
  const limits = gaugesOf(view)
    .map(g => `${g.label} ${g.remaining}% 남음${g.reset ? `, ${g.reset} 초기화` : ''}`)
    .join(', ')
  const agents = R.hasSubagents(view.agents.agents) ? R.agentsText(view.agents.agents, view.agents.now) : ''
  const board = BV.boardText(view.board.board)
  const files = V.filesText(view.files.commits, view.files.current, path => noteOf(view, path))
  return [limits, board, agents, files].filter(Boolean).join('\n\n')
}

/** 패널을 열 때 요청할 줄 수, 아이콘 줄로 잠깐 연 화면은 낮게, 홈이 아닌 화면은 최대 높이 */
export function dashboardRows(view: DashboardView): number {
  if (view.nav.isQuick) return C.PANE_QUICK_ROWS
  if (view.nav.screen !== 'home') return C.PANE_MAX_ROWS
  const noteLines = view.files.current.reduce((n, f) => {
    const { reason, place } = noteOf(view, f.path)
    return n + (reason ? 1 : 0) + (place ? 1 : 0)
  }, 0)
  const rows = 2 + TILE_ROWS + V.filesRows(view.files.commits, view.files.current, noteLines)
  return Math.min(rows, C.PANE_MAX_ROWS)
}

/** +추가 −삭제, 0 이거나 dim 이면 흐리게 */
function stat(ui: Ui, f: { added: number | null; deleted: number | null }, dim = false) {
  const { Text } = ui
  if (f.added === null || f.deleted === null) return <Text color="inactive">bin</Text>
  return (
    <Text>
      <Text color={dim || f.added === 0 ? 'inactive' : 'diffAddedWord'}>{`+${f.added}`}</Text>
      <Text> </Text>
      <Text color={dim || f.deleted === 0 ? 'inactive' : 'diffRemovedWord'}>{`−${f.deleted}`}</Text>
    </Text>
  )
}

/** 왼쪽은 남는 너비를 채우고 오른쪽은 끝에 붙는 한 줄 */
function row(ui: Ui, key: string, left: RenderChildren, right: RenderChildren) {
  const { Box } = ui
  return (
    <Box key={key} flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        {left}
      </Box>
      <Box flexShrink={0} marginLeft={1}>
        {right}
      </Box>
    </Box>
  )
}

/** 들여 쓴 흐린 보조 한 줄 */
function detail(ui: Ui, key: string, text: string) {
  const { Box, Text } = ui
  return (
    <Box key={key} paddingLeft={2}>
      <Text color="inactive" wrap="truncate-end">
        {text}
      </Text>
    </Box>
  )
}

/** 개수가 붙은 구역 제목, right 는 오른쪽 끝에 붙는 요약 */
function section(ui: Ui, key: string, title: string, n: number, right?: RenderChildren) {
  const { Box, Text } = ui
  return (
    <Box key={key} marginTop={1} flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        <Text bold>{title}</Text>
        <Text color="inactive">{` ${n}`}</Text>
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
}

/** 머리줄, 홈은 이름과 한도와 접기, 아이콘 줄로 연 화면은 제목과 접기, 다른 화면은 snitch / 제목 */
function renderHeader(ui: Ui, view: DashboardView, width: number, actions: DashboardActions, canFold: boolean) {
  const { Box, Text, Button } = ui
  const { nav } = view
  const foldButton = canFold ? (
    <Button key="fold" label="접기" plain dimColor onPress={actions.fold} />
  ) : (
    <Text key="no-fold" />
  )

  if (nav.screen === 'home') {
    /** 제목 줄에 한도 초기화 시각을 붙일 만큼 넓은지 여부 */
    const showsReset = width >= C.RESET_MIN_COLUMNS
    const gauges = (
      <Box key="gauges" flexDirection="row" columnGap={2}>
        <Text>
          {gaugesOf(view).map((g, i) => (
            <Text key={`g-${g.label}`}>
              <Text color="inactive">{`${i > 0 ? '  ' : ''}${g.label} `}</Text>
              <Text color={GAUGE_COLOR[g.level]}>{g.bar}</Text>
              <Text color="inactive">{` ${g.remaining}%`}</Text>
              <Text color="subtle">{showsReset && g.reset ? ` ${g.reset}` : ''}</Text>
            </Text>
          ))}
        </Text>
        {foldButton}
      </Box>
    )
    return row(ui, 'header', <Text bold>snitch</Text>, gauges)
  }

  const title = SCREEN_TITLE[nav.screen]
  if (nav.isDirect) {
    return row(ui, 'header', <Text bold>{title}</Text>, canFold ? foldButton : <Text color="subtle">Esc 닫기</Text>)
  }
  return row(
    ui,
    'header',
    <Box flexDirection="row">
      <Button key="crumb-home" label="snitch" plain dimColor onPress={() => actions.go('home')} />
      <Text color="subtle">{' / '}</Text>
      <Text bold>{title}</Text>
    </Box>,
    <Text color="subtle">Esc 뒤로</Text>,
  )
}

/** 홈 맨 위 칸 네 개, 비어 있어도 0개로 표시, 답을 기다리는 결정이 있으면 노란 칸 */
function renderTiles(ui: Ui, view: DashboardView, width: number, actions: DashboardActions) {
  const { Box, Text, Button } = ui
  const count = countsOf(view)
  /** 칸 너비, 칸 네 개와 사이 간격 세 칸이 패널 폭을 나눔 */
  const tileWidth = Math.max(8, Math.floor((width - 2 - 3) / 4))
  const tile = (screen: 'todos' | 'decisions' | 'agents' | 'links', value: string, isZero: boolean, isHot: boolean) => (
    <Box
      key={`tile-${screen}`}
      width={tileWidth}
      flexDirection="column"
      borderStyle="round"
      borderColor={isHot ? 'warning' : 'inactive'}
      paddingX={1}
    >
      <Button key={`tile-name-${screen}`} plain onPress={() => actions.go(screen)}>
        <Text color="inactive" wrap="truncate-end">
          {SCREEN_TITLE[screen]}
        </Text>
      </Button>
      <Button key={`tile-count-${screen}`} plain onPress={() => actions.go(screen)}>
        <Text bold color={isHot ? 'warning' : isZero ? 'inactive' : undefined}>
          {value}
        </Text>
      </Button>
    </Box>
  )
  const hasTodos = view.board.board.todos.length > 0
  const hasDecision = count.decisions !== '0'
  return (
    <Box key="tiles" flexDirection="row" columnGap={1} marginTop={1}>
      {tile('todos', hasTodos ? count.todos : '0개', !hasTodos, false)}
      {tile('decisions', `${count.decisions}개`, !hasDecision, hasDecision)}
      {tile('agents', `${count.agents}개`, count.agents === '0', false)}
      {tile('links', `${count.links}개`, count.links === '0', false)}
    </Box>
  )
}

/** 변경 파일과 커밋, 파일 행을 누르면 파일 상세 */
function renderFiles(ui: Ui, view: DashboardView, actions: DashboardActions) {
  const { Box, Text, Button } = ui
  const { commits, current } = view.files
  const fileRows = current.map(f => {
    const letter = V.statusLetter(f)
    const { reason, place, isExplaining } = noteOf(view, f.path)
    const reasonCount = view.reasons.history.get(f.path)?.length ?? 0
    return (
      <Box key={`f-${f.path}`} flexDirection="column">
        {row(
          ui,
          `fr-${f.path}`,
          <Button key={`open:${f.path}`} plain onPress={() => actions.openFile(f.path)}>
            <Text color={letter === 'A' ? 'success' : 'inactive'}>{letter}</Text>
            <Text> </Text>
            <Text bold>{splitPath(f.path).name}</Text>
            {f.otherSessions ? <Text color="warning">{`  ${V.CONFLICT_LABEL}`}</Text> : <Text />}
          </Button>,
          stat(ui, f),
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
        {place ? detail(ui, `fp-${f.path}`, place) : <Text />}
      </Box>
    )
  })
  return (
    <Box key="files" flexDirection="column">
      {section(ui, 's-files', '변경 파일', current.length, current.length > 0 ? stat(ui, V.totalsOf(current)) : undefined)}
      {current.length === 0 ? (
        <Text key="empty" color="inactive">
          아직 바뀐 파일 없음
        </Text>
      ) : (
        fileRows
      )}
      {commits.length > 0 ? section(ui, 's-commits', '커밋', commits.length) : <Text key="nc" />}
      {commits.map(c =>
        row(
          ui,
          `c-${c.hash}`,
          <Text color="inactive" wrap="truncate-end">{`● ${c.hash} ${c.subject}`}</Text>,
          stat(ui, V.totalsOf(c.files), true),
        ),
      )}
    </Box>
  )
}

/** 서브에이전트 목록, 상태 점과 작업 이름, 경과 시간, 작업 중이면 마지막 활동 */
function renderAgents(ui: Ui, view: DashboardView) {
  const { Box, Text } = ui
  const shown = subagents(view)
  if (shown.length === 0) {
    return (
      <Text key="no-agents" color="inactive">
        이 요청에서 실행한 에이전트 없음
      </Text>
    )
  }
  return (
    <Box key="agents" flexDirection="column">
      {shown.map(a => (
        <Box key={`a-${a.id}`} flexDirection="column">
          {row(
            ui,
            `ar-${a.id}`,
            <Text wrap="truncate-end">
              <Text color={STATE_COLOR[a.state]}>{R.STATE_ICON[a.state]}</Text>
              <Text bold={a.state === 'working'} color={a.state === 'waiting' ? 'inactive' : undefined}>
                {` ${R.titleOf(a)}`}
              </Text>
            </Text>,
            <Text color="inactive">{R.timeText(a, view.agents.now)}</Text>,
          )}
          {R.detailLines(a).map((line, i) => detail(ui, `ad-${a.id}-${i}`, line))}
        </Box>
      ))}
    </Box>
  )
}

/** 지금 화면의 본문 */
function renderBody(ui: Ui, view: DashboardView, width: number, actions: DashboardActions): RenderChildren {
  const { Text } = ui
  switch (view.nav.screen) {
    case 'home':
      return [
        renderTiles(ui, view, width, actions),
        <Text key="divider" color="inactive">
          {'─'.repeat(Math.max(1, width - 2))}
        </Text>,
        renderFiles(ui, view, actions),
      ]
    case 'files':
      return renderFiles(ui, view, actions)
    case 'todos':
      return renderTodos(ui, view.board)
    case 'decisions':
      return renderDecisions(ui, view.board, actions)
    case 'agents':
      return renderAgents(ui, view)
    case 'links':
      return renderLinks(ui, view.board, actions)
  }
}

/** 지금 화면을 그린 대시보드 패널, canFold 는 접기 버튼 표시 여부 */
export function renderDashboard(ui: Ui, view: DashboardView, width: number, actions: DashboardActions, canFold: boolean) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column" paddingX={1} backgroundColor={C.PANE_BACKGROUND ?? undefined}>
      {renderHeader(ui, view, width, actions, canFold)}
      {view.nav.screen === 'home' ? <Text key="no-gap" /> : <Text key="gap"> </Text>}
      {renderBody(ui, view, width, actions)}
    </Box>
  )
}
