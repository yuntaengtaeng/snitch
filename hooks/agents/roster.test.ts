import { expect, test } from 'claude-code/testing'

import * as R from './roster'

const spawn = { id: 'a1', name: 'general-purpose', task: '할 일 목록 a.md 작성' }

test('대기, 작업 중, 완료 순서로 상태가 바뀐다', () => {
  let roster = [R.mainAgent(0)]
  expect(roster[0]?.state).toBe('waiting')

  roster = R.withSpawned(roster, spawn, 1_000)
  expect(roster.find(a => a.id === 'a1')?.state).toBe('working')

  roster = R.withState(roster, 'a1', R.stateAfterTurn('answer', false), 12_000)
  const done = roster.find(a => a.id === 'a1')
  expect(done?.state).toBe('done')
  expect(done?.since).toBe(12_000)
})

test('stateAfterTurn: 메인 대화는 끝나면 대기, 오류와 거절은 오류', () => {
  expect(R.stateAfterTurn('answer', true)).toBe('waiting')
  expect(R.stateAfterTurn('aborted', true)).toBe('waiting')
  expect(R.stateAfterTurn('aborted', false)).toBe('error')
  expect(R.stateAfterTurn('error', true)).toBe('error')
  expect(R.stateAfterTurn('refusal', false)).toBe('error')
})

test('withListed: $.agent.list() 상태로 아는 에이전트만 맞춘다', () => {
  const roster = R.withSpawned([R.mainAgent(0)], spawn, 0)

  const synced = R.withListed(roster, [{ id: 'a1', status: 'killed' }, { id: 'zz', status: 'running' }], 5_000)

  expect(synced.find(a => a.id === 'a1')?.state).toBe('error')
  expect(synced.some(a => a.id === 'zz')).toBe(false)
})

test('visibleAgents: 메인, 진행 중, 최근 끝난 순서로 끝난 것은 개수 제한', () => {
  let roster = [R.mainAgent(0)]
  for (const [i, id] of ['d1', 'd2', 'd3'].entries()) {
    roster = R.withSpawned(roster, { ...spawn, id }, 0)
    roster = R.withState(roster, id, 'done', i * 1_000)
  }
  roster = R.withSpawned(roster, { ...spawn, id: 'w1' }, 0)

  expect(R.visibleAgents(roster, 2).map(a => a.id)).toEqual(['main', 'w1', 'd3', 'd2'])
})

test('activityOf: 파일 경로는 이름만, 명령은 첫 줄만', () => {
  expect(R.activityOf('Write', { file_path: 'C:\\r\\notes\\a.md' })).toBe('Write a.md')
  expect(R.activityOf('Bash', { command: 'npm test\nnpm run lint' })).toBe('Bash npm test')
  expect(R.activityOf('TodoWrite', {})).toBe('TodoWrite')
})

test('statusLine: 상태별 문구에 가운뎃점과 화살표가 없다', () => {
  const working = { ...R.mainAgent(0), state: 'working' as const, activity: 'Write a.md' }

  expect(R.statusLine(working, 72_000)).toBe('작업 중, 1분 12초, Write a.md')
  expect(R.statusLine({ ...working, state: 'done' }, 3_000)).toBe('완료, 방금')
  expect(R.statusLine({ ...working, state: 'done' }, 30_000)).toBe('완료, 30초 전')
  expect(R.statusLine({ ...working, state: 'waiting' }, 30_000)).toBe('대기')
})
