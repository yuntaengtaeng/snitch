import type { Elements } from 'claude-code'

import type { BoardView } from '../board/tracker'
import * as BV from '../board/view'

/** 보드 구역을 그리는 부품, 모바일은 Input 이 없어 직접 답하기를 숨김 */
export type BoardUi = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button' | 'Link'> &
  Partial<Pick<Elements['terminal'], 'Input'>>

export type BoardActions = {
  answer: (id: string, value: string) => void
  toggleAnswering: (id: string) => void
  clearLinks: () => void
}

/** 직접 답하기 입력칸의 요소 주소 */
export function answerKey(id: string): string {
  return `answer-${id}`
}

/** 할 일 진행 막대 칸 수 */
const TODO_BAR_SEGMENTS = 6

/** 결정 카드, 할 일, 링크 구역, 비어 있는 구역은 그리지 않음 */
export function renderBoard(ui: BoardUi, view: BoardView, actions: BoardActions) {
  const { Box, Text, Button, Link, Input } = ui
  const { board, answering } = view
  const open = BV.openTodos(board.todos)
  const done = BV.doneCount(board.todos)

  const decisionCard =
    board.decisions.length === 0 ? (
      <Text key="no-decisions" />
    ) : (
      <Box key="decisions" flexDirection="column" marginTop={1} borderStyle="round" borderColor="warning" paddingX={1}>
        <Text>
          <Text bold color="warning">
            결정 필요
          </Text>
          <Text color="inactive">{` ${board.decisions.length}`}</Text>
        </Text>
        {board.decisions.map((d, i) => (
          <Box key={`d-${d.id}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
            <Text bold wrap="wrap">
              {d.text}
            </Text>
            {d.answered ? (
              <Text color="success" wrap="truncate-end">
                {BV.answeredText(d)}
              </Text>
            ) : (
              <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                {d.options.map(option => (
                  <Button key={`opt-${d.id}-${option}`} label={option} onPress={() => actions.answer(d.id, option)} />
                ))}
                {Input ? (
                  <Button
                    key={`own-${d.id}`}
                    label={answering === d.id ? '취소' : '직접 답하기'}
                    dimColor={answering !== d.id}
                    onPress={() => actions.toggleAnswering(d.id)}
                  />
                ) : (
                  <Text />
                )}
              </Box>
            )}
            {Input && answering === d.id && !d.answered ? (
              <Input
                key={answerKey(d.id)}
                placeholder="답을 쓰고 Enter"
                submitLabel="보내기"
                autoFocus
                onSubmit={value => actions.answer(d.id, value)}
              />
            ) : (
              <Text />
            )}
          </Box>
        ))}
      </Box>
    )

  const todoSection =
    board.todos.length === 0 ? (
      <Text key="no-todos" />
    ) : (
      <Box key="todos" flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text>
              <Text bold>할 일</Text>
              <Text color="inactive">{` ${done}/${board.todos.length}`}</Text>
            </Text>
          </Box>
          <Text color="success">{BV.progressBar(done, board.todos.length, TODO_BAR_SEGMENTS)}</Text>
        </Box>
        {open.map(t => (
          <Box key={`t-${t.id}`} flexDirection="row">
            <Text color={t.state === 'active' ? 'warning' : 'inactive'}>{`${BV.TODO_ICON[t.state]} `}</Text>
            <Box flexGrow={1} flexShrink={1}>
              <Text bold={t.state === 'active'} wrap="wrap">
                {t.text}
              </Text>
            </Box>
            {t.state === 'active' ? <Text color="warning">{' 진행 중'}</Text> : <Text />}
          </Box>
        ))}
        {done > 0 ? <Text color="inactive">{`✓ ${done}개 완료`}</Text> : <Text />}
      </Box>
    )

  const linkSection =
    board.links.length === 0 ? (
      <Text key="no-links" />
    ) : (
      <Box key="links" flexDirection="column" marginTop={1}>
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text>
              <Text bold>링크</Text>
              <Text color="inactive">{` ${board.links.length}`}</Text>
            </Text>
          </Box>
          <Button key="clear-links" label="지우기" plain dimColor onPress={actions.clearLinks} />
        </Box>
        {board.links.map(p => (
          <Text key={`l-${p.href}`} wrap="truncate-end">
            <Text color="inactive">{'  '}</Text>
            <Link href={p.href}>
              <Text>{p.label}</Text>
            </Link>
          </Text>
        ))}
      </Box>
    )

  return (
    <Box key="board" flexDirection="column">
      {decisionCard}
      {todoSection}
      {linkSection}
    </Box>
  )
}
