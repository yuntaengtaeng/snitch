import { expect, test } from 'claude-code/testing'

import { applyUpdate, EMPTY_BOARD, markAnswered } from '../board/board'
import { isWideViewport, screenCounts } from './screens'

test('isWideViewport: 전체화면이면서 기준 너비 이상일 때만 넓은 창', () => {
  expect(isWideViewport({ columns: 160, isFullscreen: true }, 144)).toBe(true)
  expect(isWideViewport({ columns: 120, isFullscreen: true }, 144)).toBe(false)
  expect(isWideViewport({ columns: 200, isFullscreen: false }, 144)).toBe(false)
  expect(isWideViewport(undefined, 144)).toBe(false)
})

test('screenCounts: 결정은 답하지 않은 것만, 에이전트는 메인 대화를 빼고 센다', () => {
  let board = applyUpdate(EMPTY_BOARD, { add_todos: ['a', 'b'], done_todos: [], open_decisions: [{ question: 'A?' }, { question: 'B?' }] })
  board = markAnswered(applyUpdate(board, { done_todos: ['t1'] }), 'd1', '예')
  const agents = [
    { id: 'main', name: 'main', task: '', state: 'working', startedAt: 0, since: 0 },
    { id: 'x', name: 'Explore', task: '조사', state: 'working', startedAt: 0, since: 0 },
  ] as const
  expect(screenCounts({ files: 3, board, agents: agents as never })).toEqual({
    files: '3',
    todos: '1/2',
    decisions: '1',
    agents: '1',
    links: '0',
  })
})
