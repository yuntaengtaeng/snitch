import { expect, test } from 'claude-code/testing'

import type { FileStat } from './git'
import { filesRows, filesText } from './view'

test('filesText: 변경 이유가 있는 파일은 이름 아래에 이유를 표시한다', () => {
  const current: FileStat[] = [
    { path: 'src/a.ts', added: 3, deleted: 1 },
    { path: 'b.ts', added: 1, deleted: 0 },
  ]

  const text = filesText([], current, new Map([['src/a.ts', '로그인 실패 안내 추가']]))

  expect(text).toContain('  M a.ts  +3 −1\n    이유: 로그인 실패 안내 추가\n    src')
  expect(text).not.toContain('이유: undefined')
})

test('filesRows: 변경 이유 줄 수만큼 늘어난다', () => {
  const current: FileStat[] = [{ path: 'a.ts', added: 1, deleted: 0 }]

  expect(filesRows([], current, 1)).toBe(filesRows([], current) + 1)
})
