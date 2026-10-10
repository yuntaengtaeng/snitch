import { expect, test } from 'claude-code/testing'

import type { Host } from '../host'
import { createReasons } from './tracker'

/** 모델 호출 대신 요청받은 파일 목록을 기록하는 변경 이유 tracker */
function setup() {
  const asked: string[][] = []
  let markAsked: () => void = () => undefined
  const firstAsk = new Promise<void>(resolve => {
    markAsked = resolve
  })
  const host = {
    complete: async (prompt: string) => {
      asked.push([...prompt.matchAll(/=== (.+) ===/g)].map(m => m[1] ?? ''))
      markAsked()
      return '{}'
    },
  } as unknown as Host
  const reasons = createReasons({
    getHost: () => host,
    changeOf: async rel => `+ ${rel}`,
    onChange: () => undefined,
  })
  return { reasons, asked, firstAsk }
}

test('작성자 메모가 있는 파일은 그 메모를 쓰고 모델 요약에서 빠진다', async () => {
  const { reasons, asked, firstAsk } = setup()
  reasons.noteEdit('a.md')
  reasons.noteEdit('b.md')

  reasons.noted([{ rel: 'a.md', reason: '할 일 목록 예시 추가.' }])
  reasons.turnEnded('')
  await firstAsk

  expect(reasons.view().reasons.get('a.md')).toBe('할 일 목록 예시 추가')
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
