import type { Elements, RenderChildren } from 'claude-code'

import * as R from '../agents/roster'
import type { AgentsView } from '../agents/tracker'
import * as C from '../config'
import { fileUrl, splitPath } from '../paths'
import type { ReasonsView } from '../reasons/tracker'
import type { WorkFilesView } from '../work-files/tracker'
import * as V from '../work-files/view'

export type DashboardView = { agents: AgentsView; files: WorkFilesView; reasons: ReasonsView }

type Ui = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Link'>

const STATE_COLOR: Record<R.AgentState, 'inactive' | 'warning' | 'success' | 'error'> = {
  waiting: 'inactive',
  working: 'warning',
  done: 'success',
  error: 'error',
}

/** /changes text 와 좁은 화면용 텍스트 버전 */
export function dashboardText(view: DashboardView): string {
  const { agents, files, reasons } = view
  return `${R.agentsText(agents.agents, agents.now)}\n\n${V.filesText(files.commits, files.current, reasons.reasons)}`
}

/** 패널을 열 때 요청할 줄 수 */
export function dashboardRows(view: DashboardView): number {
  const { reasons, explaining } = view.reasons
  const reasonLines = view.files.current.filter(f => reasons.has(f.path) || explaining.has(f.path)).length
  const rows = R.agentsRows(view.agents.agents) + V.filesRows(view.files.commits, view.files.current, reasonLines)
  return Math.min(rows, C.PANE_MAX_ROWS)
}

/** 에이전트 구역과 작업 파일 구역으로 된 대시보드 패널 */
export function renderDashboard(ui: Ui, view: DashboardView, width: number) {
  const { Box, Text, Link } = ui
  const { agents, files, reasons } = view
  const { repoRoot, commits, current } = files
  const all = V.totalsOf(current)

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

  const label = (key: string, text: string) => (
    <Box key={key} marginTop={1}>
      <Text color="inactive" bold>
        {text}
      </Text>
    </Box>
  )

  const agentRows = agents.agents.map(a => (
    <Box key={`a-${a.id}`} flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={STATE_COLOR[a.state]}>●</Text>
        <Text> </Text>
        <Text bold>{a.name}</Text>
        <Text color="inactive">{a.task ? `  ${a.task}` : ''}</Text>
      </Text>
      <Box paddingLeft={2}>
        <Text color={a.state === 'error' ? 'error' : 'inactive'} wrap="truncate-end">
          {R.statusLine(a, agents.now)}
        </Text>
      </Box>
    </Box>
  ))

  const commitRows = commits.map(c =>
    row(
      `c-${c.hash}`,
      <Text color="inactive" wrap="truncate-end">{`● ${c.hash} ${c.subject}`}</Text>,
      stat(V.totalsOf(c.files), true),
    ),
  )

  const fileRows = current.map(f => {
    const { name, dir } = splitPath(f.path)
    const letter = V.statusLetter(f)
    const editorId = files.editedBy.get(f.path)
    const place = [dir, editorId ? agents.taskOf(editorId) : ''].filter(Boolean).join(', ')
    const reason = reasons.reasons.get(f.path)
    return (
      <Box key={`f-${f.path}`} flexDirection="column">
        {row(
          `fr-${f.path}`,
          <Text wrap="truncate-end">
            <Text color={letter === 'A' ? 'success' : 'inactive'}>{letter}</Text>
            <Text> </Text>
            {repoRoot ? (
              <Link href={fileUrl(repoRoot, f.path)}>
                <Text bold>{name}</Text>
              </Link>
            ) : (
              <Text bold>{name}</Text>
            )}
            {f.otherSessions ? <Text color="yellow">{`  ${V.CONFLICT_LABEL}`}</Text> : <Text />}
          </Text>,
          stat(f),
        )}
        {reason ? (
          <Box paddingLeft={2}>
            <Text wrap="truncate-end">{reason}</Text>
          </Box>
        ) : reasons.explaining.has(f.path) ? (
          <Box paddingLeft={2}>
            <Text color="inactive" italic>
              변경 이유 정리 중…
            </Text>
          </Box>
        ) : (
          <Text />
        )}
        {place ? (
          <Box paddingLeft={2}>
            <Text color="inactive" wrap="truncate-middle">
              {place}
            </Text>
          </Box>
        ) : (
          <Text />
        )}
      </Box>
    )
  })

  return (
    <Box flexDirection="column" paddingX={1} backgroundColor={C.PANE_BACKGROUND ?? undefined}>
      {row(
        'header',
        <Text bold>snitch</Text>,
        <Text>
          <Text color="inactive">{`${all.files} files  `}</Text>
          {stat(all)}
        </Text>,
      )}
      <Text key="divider" color="inactive">
        {'─'.repeat(Math.max(1, width - 2))}
      </Text>
      {label('l-agents', '에이전트')}
      {agentRows}
      {label('l-files', '작업 파일')}
      {commits.length > 0 ? label('l-commits', '커밋') : <Text key="nc" />}
      {commitRows}
      {commits.length > 0 ? label('l-after', '커밋 이후') : <Text key="na" />}
      {current.length === 0 ? (
        <Text key="empty" color="inactive">
          편집한 파일 없음
        </Text>
      ) : (
        fileRows
      )}
    </Box>
  )
}
