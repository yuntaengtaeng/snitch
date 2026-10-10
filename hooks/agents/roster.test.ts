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

test('visibleAgents: 메인, 진행 중, 최근 끝난 순서로 끝난 지 오래된 것은 숨긴다', () => {
  let roster = [R.mainAgent(0)]
  for (const [id, endedAt] of [['old', 0], ['d1', 50_000], ['d2', 55_000]] as const) {
    roster = R.withSpawned(roster, { ...spawn, id }, 0)
    roster = R.withState(roster, id, 'done', endedAt)
  }
  roster = R.withSpawned(roster, { ...spawn, id: 'w1' }, 0)

  expect(R.visibleAgents(roster, 70_000, 60_000).map(a => a.id)).toEqual(['main', 'w1', 'd2', 'd1'])
  expect(R.withoutExpired(roster, 70_000, 60_000).some(a => a.id === 'old')).toBe(false)
})

test('needsTick: 메인만 대기 중이면 다시 그릴 필요 없음', () => {
  const idle = [R.mainAgent(0)]

  expect(R.needsTick(idle)).toBe(false)
  expect(R.needsTick(R.withState(idle, 'main', 'working', 1))).toBe(true)
  expect(R.needsTick(R.withState(R.withSpawned(idle, spawn, 0), 'a1', 'done', 1))).toBe(true)
})

test('activityOf: 파일 툴은 툴과 파일 이름, 명령은 경로를 줄인 첫 줄', () => {
  expect(R.activityOf('Write', { file_path: 'C:\\r\\notes\\a.md' })).toBe('Write a.md')
  expect(R.activityOf('Bash', { command: 'cat /c/Users/dbsxo/snitch-test/notes/a.md\nls' })).toBe('cat a.md')
  expect(R.activityOf('Bash', { command: 'npm test' })).toBe('npm test')
  expect(R.activityOf('TodoWrite', {})).toBe('TodoWrite')
})

test('shortenPaths: Windows 와 POSIX 경로를 파일 이름으로 줄인다', () => {
  expect(R.shortenPaths('type C:\\r\\notes\\b.md')).toBe('type b.md')
  expect(R.shortenPaths('diff /a/x.ts /b/y.ts')).toBe('diff x.ts y.ts')
  expect(R.shortenPaths('git status')).toBe('git status')
})

test('agentsText: 상태 아이콘, 제목, 시간, 작업 중 활동', () => {
  let roster = R.withSpawned([R.mainAgent(0)], spawn, 0)
  roster = R.withActivity(roster, 'a1', 'Write a.md')

  expect(R.agentsText(roster, 7_000)).toBe('에이전트 2\n  ○ main\n  ● 할 일 목록 a.md 작성  7초\n    Write a.md')
})

test('timeText: 작업 중은 경과 시간, 끝나면 걸린 시간, 대기는 빈 문자열', () => {
  let roster = R.withSpawned([R.mainAgent(0)], spawn, 1_000)
  const working = roster.find(a => a.id === 'a1')!
  expect(R.timeText(working, 73_000)).toBe('1분 12초')

  roster = R.withState(roster, 'a1', 'done', 13_000)
  expect(R.timeText(roster.find(a => a.id === 'a1')!, 90_000)).toBe('12초')
  expect(R.timeText(R.mainAgent(0), 90_000)).toBe('')
})

test('titleOf 와 detailLines: 제목은 작업 이름, 아래 줄은 작업 중일 때 활동만', () => {
  const agent = { ...R.withSpawned([], spawn, 0)[0]!, activity: 'Write a.md' }

  expect(R.titleOf(agent)).toBe('할 일 목록 a.md 작성')
  expect(R.titleOf(R.mainAgent(0))).toBe('main')
  expect(R.detailLines(agent)).toEqual(['Write a.md'])
  expect(R.detailLines({ ...agent, state: 'done' })).toEqual([])
})
