import { expect, test } from 'claude-code/testing'

import { parseNotes } from './note-tool'

test('parseNotes: 경로와 이유가 모두 있는 메모만 꺼낸다', () => {
  const input = {
    notes: [
      { path: ' notes/a.md ', reason: '할 일 목록 예시 추가' },
      { path: 'b.md', reason: '' },
      { path: 3, reason: '숫자 경로' },
      null,
    ],
  }

  expect(parseNotes(input)).toEqual([{ path: 'notes/a.md', reason: '할 일 목록 예시 추가' }])
})

test('parseNotes: notes 가 배열이 아니면 빈 배열', () => {
  expect(parseNotes({})).toEqual([])
  expect(parseNotes({ notes: 'a.md' })).toEqual([])
})
