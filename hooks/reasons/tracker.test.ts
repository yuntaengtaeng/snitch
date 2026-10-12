import { expect, test } from 'claude-code/testing'

import type { Host } from '../host'
import { createReasons, latestReason } from './tracker'

/** 대기 중인 마이크로태스크 처리, 모델 응답 뒤의 기록까지 반영 */
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

/** 모델 호출 대신 요청받은 파일 목록을 기록하고, 비교 기준 blob 을 턴마다 새로 주는 변경 이유 tracker */
function setup(answer = '{}') {
  const asked: string[][] = []
  const since: (string | null)[] = []
  let snapshots = 0
  let markAsked: () => void = () => undefined
  let nextAsk = new Promise<void>(resolve => {
    markAsked = resolve
  })
  const host = {
    complete: async (prompt: string) => {
      asked.push([...prompt.matchAll(/=== (.+) ===/g)].map(m => m[1] ?? ''))
      const done = markAsked
      nextAsk = new Promise<void>(resolve => {
        markAsked = resolve
      })
      done()
      return answer
    },
  } as unknown as Host
  const reasons = createReasons({
    getHost: () => host,
    changeSince: async (rel, blob) => {
      since.push(blob)
      return { isNew: false, text: `+ ${rel}` }
    },
    snapshot: async () => `blob${++snapshots}`,
    onChange: () => undefined,
  })
  return { reasons, asked, since, nextAsk: () => nextAsk }
}

test('작성자 메모가 있는 파일은 그 메모를 쓰고 모델 요약에서 빠진다', async () => {
  const { reasons, asked, nextAsk } = setup()
  const asking = nextAsk()
  reasons.noteEdit('a.md')
  reasons.noteEdit('b.md')

  reasons.noted([{ rel: 'a.md', reason: '할 일 목록 예시 추가.' }])
  reasons.turnEnded('')
  await asking

  expect(latestReason(reasons.view(), 'a.md')).toBe('할 일 목록 예시 추가')
  expect(asked).toEqual([['b.md']])
})

test('모든 파일에 메모가 있으면 모델을 부르지 않는다', () => {
  const { reasons, asked } = setup()
  reasons.noteEdit('a.md')

  expect(reasons.noted([{ rel: 'a.md', reason: '회의록 추가' }, { rel: 'x.md', reason: '  ' }])).toBe(1)
  reasons.turnEnded('')

  expect(asked).toEqual([])
  expect(reasons.view().explaining.size).toBe(0)
})

test('같은 파일을 다른 요청으로 고치면 이유가 요청 순서대로 쌓인다', () => {
  const { reasons } = setup()
  reasons.noteRequest('로그인 실패하면 에러 나는 거 고쳐줘')
  reasons.noteEdit('login.ts')
  reasons.noted([{ rel: 'login.ts', reason: '로그인 오류 수정' }])
  reasons.noteRequest('버튼에 로딩 표시 넣어줘')
  reasons.noteEdit('login.ts')
  reasons.noted([{ rel: 'login.ts', reason: '로딩 상태 추가' }])

  const history = reasons.view().history.get('login.ts') ?? []
  expect(history.map(e => [e.reason, e.request])).toEqual([
    ['로그인 오류 수정', '로그인 실패하면 에러 나는 거 고쳐줘'],
    ['로딩 상태 추가', '버튼에 로딩 표시 넣어줘'],
  ])
})

test('두 번째 턴의 요약은 첫 턴 종료 시점 이후의 변경만 본다', async () => {
  const { reasons, since, nextAsk } = setup('{"a.ts":"로딩 상태 추가"}')
  reasons.noteRequest('첫 요청')
  reasons.noteEdit('a.ts')
  let asking = nextAsk()
  reasons.turnEnded('')
  await asking

  reasons.noteRequest('두 번째 요청')
  reasons.noteEdit('a.ts')
  asking = nextAsk()
  reasons.turnEnded('')
  await asking
  await flush()

  expect(since).toEqual([null, 'blob1'])
  expect(reasons.view().history.get('a.ts')?.length).toBe(2)
})

test('커밋된 파일은 이력과 비교 기준을 지운다', async () => {
  const { reasons, since, nextAsk } = setup()
  reasons.noteEdit('a.ts')
  reasons.noted([{ rel: 'a.ts', reason: '메모' }])
  reasons.noteEdit('b.ts')
  let asking = nextAsk()
  reasons.turnEnded('')
  await asking

  reasons.forget(['a.ts', 'b.ts'])
  reasons.noteEdit('b.ts')
  asking = nextAsk()
  reasons.turnEnded('')
  await asking

  expect(reasons.view().history.has('a.ts')).toBe(false)
  expect(since).toEqual([null, null])
})
