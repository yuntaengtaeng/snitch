import type { Elements } from 'claude-code'

import * as C from '../config'
import { partsRows } from '../file-detail/diff'
import type { FileDetailView } from '../file-detail/tracker'
import { splitPath } from '../paths'
import { requestLine, type ReasonEntry } from '../reasons/history'

/** 파일 상세 화면을 그리는 부품, Input 이 없는 화면은 수정 요청 버튼 숨김 */
export type DetailUi = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button' | 'Code' | 'Link'> &
  Partial<Pick<Elements['terminal'], 'Input'>>

export type DetailActions = {
  back: () => void
  ask: (index: number) => void
  send: (index: number, instruction: string) => void
}

/** 수정 요청 입력칸의 요소 주소 */
export function askKey(index: number): string {
  return `ask-${index}`
}

/** 상세 화면을 열 때 요청할 줄 수 */
export function detailRows(view: FileDetailView, history: readonly ReasonEntry[]): number {
  const parts = view.diff?.parts ?? []
  const historyRows = 2 + Math.max(1, history.length * 2)
  const diffRows = 2 + partsRows(parts) + parts.length * 2
  return Math.min(4 + historyRows + diffRows, C.PANE_MAX_ROWS)
}

/** 파일 하나의 변경 이유 이력과 hunk 별 diff, hunk 마다 수정 요청 */
export function renderFileDetail(
  ui: DetailUi,
  view: FileDetailView & { path: string },
  history: readonly ReasonEntry[],
  stat: { added: number | null; deleted: number | null } | undefined,
  /** 파일 이름에 거는 file:// 링크, 링크를 끈 설정이면 undefined */
  href: string | undefined,
  width: number,
  actions: DetailActions,
) {
  const { Box, Text, Button, Code, Input, Link } = ui
  const { name, dir } = splitPath(view.path)
  const parts = view.diff?.parts ?? []

  const section = (key: string, title: string, count: number) => (
    <Box key={key} marginTop={1}>
      <Text bold>{title}</Text>
      <Text color="inactive">{` ${count}`}</Text>
    </Box>
  )

  const statText =
    stat === undefined ? (
      <Text />
    ) : stat.added === null || stat.deleted === null ? (
      <Text color="inactive">bin</Text>
    ) : (
      <Text>
        <Text color="diffAddedWord">{`+${stat.added}`}</Text>
        <Text> </Text>
        <Text color="diffRemovedWord">{`−${stat.deleted}`}</Text>
      </Text>
    )

  const historyRows =
    history.length === 0 ? (
      <Text key="h-empty" color="inactive">
        아직 없음
      </Text>
    ) : (
      history.map((e, i) => (
        <Box key={`h-${i}`} flexDirection="column">
          <Text wrap="truncate-end">
            <Text color="inactive">{`${i + 1} `}</Text>
            <Text bold={i === history.length - 1}>{e.reason}</Text>
          </Text>
          {e.request ? (
            <Box paddingLeft={2}>
              <Text color="inactive" wrap="truncate-end">
                {requestLine(e.request, width)}
              </Text>
            </Box>
          ) : (
            <Text />
          )}
        </Box>
      ))
    )

  const partRows = parts.map(p => (
    <Box key={`p-${p.index}`} flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          <Text color="inactive">{p.range}</Text>
        </Box>
        {Input ? (
          <Button
            key={`req-${p.index}`}
            label={view.asking === p.index ? '취소' : '수정 요청'}
            dimColor={view.asking !== p.index}
            hotkey={p.index < 9 ? String(p.index + 1) : undefined}
            onPress={() => actions.ask(p.index)}
          />
        ) : (
          <Text />
        )}
      </Box>
      <Code source={p.code} format={p.format} path={view.path} startLine={p.format === 'source' ? 1 : undefined} />
      {Input && view.asking === p.index ? (
        <Input
          key={askKey(p.index)}
          placeholder="예: 이 부분은 기존 방식으로 수정해줘"
          submitLabel="보내기"
          autoFocus
          onSubmit={value => actions.send(p.index, value)}
        />
      ) : (
        <Text />
      )}
    </Box>
  ))

  const diffBody =
    view.diff === null ? (
      <Text key="d-loading" color="inactive">
        불러오는 중…
      </Text>
    ) : parts.length === 0 ? (
      <Text key="d-empty" color="inactive">
        표시할 변경 없음, 커밋됐거나 바이너리 파일
      </Text>
    ) : (
      partRows
    )

  return (
    <Box flexDirection="column" paddingX={1} backgroundColor={C.PANE_BACKGROUND ?? undefined}>
      <Box key="header" flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          <Button key="back" label="‹ 목록" plain dimColor hotkey="b" onPress={actions.back} />
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          {statText}
        </Box>
      </Box>
      <Text key="title" wrap="truncate-end">
        {href ? (
          <Link href={href}>
            <Text bold>{name}</Text>
          </Link>
        ) : (
          <Text bold>{name}</Text>
        )}
        <Text color="inactive">{dir ? `  ${dir}` : ''}</Text>
      </Text>
      <Text key="divider" color="inactive">
        {'─'.repeat(Math.max(1, width - 2))}
      </Text>
      {section('s-history', '변경 이유', history.length)}
      {historyRows}
      {section('s-diff', '변경 내용', parts.length)}
      {view.sent ? (
        <Text key="sent" color="success" wrap="truncate-end">
          {`요청 보냄, ${view.sent}`}
        </Text>
      ) : (
        <Text key="no-sent" />
      )}
      {diffBody}
      {view.diff?.omitted ? (
        <Text key="omitted" color="inactive">
          {view.diff.omitted}
        </Text>
      ) : (
        <Text key="no-omitted" />
      )}
    </Box>
  )
}
