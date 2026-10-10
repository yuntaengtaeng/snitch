import { expect, test } from 'claude-code/testing'

import type { FileStat } from './git'
import { filesRows, filesText, placeOf } from './view'

test('filesText: 파일 아래에 변경 이유와 위치를 표시하고 커밋은 뒤에 둔다', () => {
  const current: FileStat[] = [
    { path: 'src/a.ts', added: 3, deleted: 1 },
    { path: 'b.ts', added: 1, deleted: 0 },
  ]
  const commits = [{ hash: 'ef640ff', subject: 'init', files: [] }]
  const notes = new Map([['src/a.ts', { reason: '로그인 실패 안내 추가', place: 'src, 로그인 수정' }]])

  const text = filesText(commits, current, path => notes.get(path) ?? { place: '' })

  expect(text).toContain('변경 파일 2\n  M a.ts  +3 −1\n    로그인 실패 안내 추가\n    src, 로그인 수정')
  expect(text).toContain('\n\n커밋 1\n  ● ef640ff init')
  expect(text).not.toContain('커밋 이후')
})

test('placeOf: 폴더와 작업 이름을 쉼표로 잇는다', () => {
  expect(placeOf('notes/a.md', '할 일 작성')).toBe('notes, 할 일 작성')
  expect(placeOf('a.md', '')).toBe('')
})

test('filesRows: 설명 줄 수만큼 늘어난다', () => {
  const current: FileStat[] = [{ path: 'a.ts', added: 1, deleted: 0 }]

  expect(filesRows([], current, 1)).toBe(filesRows([], current) + 1)
})
