import type { Elements, RenderSurface } from 'claude-code'

import type { Pin } from '../board/board'
import type { BoardView } from '../board/tracker'
import * as BV from '../board/view'

/** 보드 화면을 그리는 부품, Input 이 없는 화면은 직접 답하기 숨김 */
export type BoardUi = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'> &
  Partial<Pick<Elements['terminal'], 'Input'>>

export type BoardActions = {
  answer: (id: string, value: string) => void
  toggleAnswering: (id: string) => void
  clearLinks: () => void
  copyLink: (pin: Pin, surface: RenderSurface) => void
}

/** 직접 답하기 입력칸의 요소 주소 */
export function answerKey(id: string): string {
  return `answer-${id}`
}

/** 링크 복사 버튼 기호, 이모지가 아닌 겹친 사각형 */
const COPY_ICON = '⧉'

/** 할 일 진행 막대 칸 수 */
const TODO_BAR_SEGMENTS = 10

/** 결정 화면, 결정마다 선택지 버튼과 직접 답하기 */
export function renderDecisions(ui: BoardUi, view: BoardView, actions: BoardActions) {
  const { Box, Text, Button, Input } = ui
  const { board, answering } = view
  if (board.decisions.length === 0) {
    return (
      <Text key="no-decisions" color="inactive">
        답을 기다리는 결정 없음
      </Text>
    )
  }
  return (
    <Box key="decisions" flexDirection="column">
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
}

/** 할 일 화면, 진행 막대와 진행 중, 남은 할 일, 끝난 할 일 순 */
export function renderTodos(ui: BoardUi, view: BoardView) {
  const { Box, Text } = ui
  const { todos } = view.board
  if (todos.length === 0) {
    return (
      <Text key="no-todos" color="inactive">
        Claude 가 남긴 할 일 없음
      </Text>
    )
  }
  const done = BV.doneCount(todos)
  const finished = todos.filter(t => t.state === 'done')
  return (
    <Box key="todos" flexDirection="column">
      <Text>
        <Text color="success">{BV.progressBar(done, todos.length, TODO_BAR_SEGMENTS)}</Text>
        <Text color="inactive">{` ${done}/${todos.length} 완료`}</Text>
      </Text>
      {[...BV.openTodos(todos), ...finished].map(t => (
        <Box key={`t-${t.id}`} flexDirection="row">
          <Text color={t.state === 'active' ? 'warning' : t.state === 'done' ? 'success' : 'inactive'}>
            {`${BV.TODO_ICON[t.state]} `}
          </Text>
          <Box flexGrow={1} flexShrink={1}>
            <Text bold={t.state === 'active'} color={t.state === 'done' ? 'inactive' : undefined} wrap="wrap">
              {t.text}
            </Text>
          </Box>
          {t.state === 'active' ? <Text color="warning">{' 진행 중'}</Text> : <Text />}
        </Box>
      ))}
    </Box>
  )
}

/** 링크 화면, 이름과 전체 주소, 복사 버튼 */
export function renderLinks(ui: BoardUi, view: BoardView, actions: BoardActions) {
  const { Box, Text, Button } = ui
  const { links } = view.board
  if (links.length === 0) {
    return (
      <Text key="no-links" color="inactive">
        Claude 가 만든 링크 없음
      </Text>
    )
  }
  return (
    <Box key="links" flexDirection="column">
      {links.map((p, i) => (
        <Box key={`l-${p.href}`} flexDirection="column" marginTop={i === 0 ? 0 : 1}>
          <Box flexDirection="row">
            <Box flexGrow={1} flexShrink={1}>
              <Button key={`copy-${p.href}`} plain onPress={press => actions.copyLink(p, press.surface)}>
                <Text bold wrap="truncate-end">
                  {p.label}
                </Text>
              </Button>
            </Box>
            <Button
              key={`copy-icon-${p.href}`}
              label={COPY_ICON}
              plain
              dimColor
              onPress={press => actions.copyLink(p, press.surface)}
            />
          </Box>
          <Text color="inactive" wrap="truncate-end">
            {p.href}
          </Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Button key="clear-links" label="모두 지우기" plain dimColor onPress={actions.clearLinks} />
      </Box>
    </Box>
  )
}
