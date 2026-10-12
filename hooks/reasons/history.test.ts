import { expect, test } from 'claude-code/testing'

import { addEntry, historyText, MAX_HISTORY, replaceLatest, requestLine, type ReasonEntry } from './history'

const entry = (requestId: number, reason: string, source: ReasonEntry['source'] = 'note'): ReasonEntry => ({
  requestId,
  request: `요청 ${requestId}`,
  reason,
  source,
})

test('addEntry: 다른 요청의 이유는 차례로 쌓인다', () => {
  const history = addEntry([entry(1, '로그인 오류 수정')], entry(2, '로딩 상태 추가'))
  expect(history.map(e => e.reason)).toEqual(['로그인 오류 수정', '로딩 상태 추가'])
})

test('addEntry: 같은 요청의 이유는 마지막 항목을 교체한다', () => {
  const history = addEntry([entry(1, '첫 메모')], entry(1, '고친 메모'))
  expect(history.map(e => e.reason)).toEqual(['고친 메모'])
})

test('addEntry: 같은 요청이면 모델 요약이 작성자 메모를 덮지 않는다', () => {
  const history = addEntry([entry(1, '작성자 메모')], entry(1, '모델 요약', 'summary'))
  expect(history.map(e => e.reason)).toEqual(['작성자 메모'])
})

test('addEntry: 최대 개수를 넘으면 오래된 항목부터 버린다', () => {
  let history: ReasonEntry[] = []
  for (let i = 1; i <= MAX_HISTORY + 2; i++) history = addEntry(history, entry(i, `이유 ${i}`))
  expect(history.length).toBe(MAX_HISTORY)
  expect(history[0]?.reason).toBe('이유 3')
})

test('replaceLatest: 마지막 항목의 이유만 바꾸고 요청은 유지한다', () => {
  const history = replaceLatest([entry(1, 'a'), entry(2, 'b')], entry(9, '다시 요약', 'summary'))
  expect(history[1]).toEqual({ requestId: 2, request: '요청 2', reason: '다시 요약', source: 'summary' })
  expect(replaceLatest([], entry(9, '새 요약'))).toEqual([entry(9, '새 요약')])
})

test('requestLine: 줄바꿈을 합치고 길면 자른다', () => {
  expect(requestLine('로그인\n  고쳐줘', 20)).toBe('로그인 고쳐줘')
  expect(requestLine('가나다라마바사', 4)).toBe('가나다…')
})

test('historyText: 오래된 요청부터 번호와 요청을 붙인다', () => {
  expect(historyText('a.ts', [entry(1, '로그인 오류 수정'), entry(2, '로딩 상태 추가')])).toBe(
    ['a.ts', '  1 로그인 오류 수정', '    요청: 요청 1', '  2 로딩 상태 추가', '    요청: 요청 2'].join('\n'),
  )
  expect(historyText('a.ts', [])).toBe('a.ts\n  남은 변경 이유 없음')
})
