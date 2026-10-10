import { expect, test } from 'claude-code/testing'

import { bashChangedFiles, changedPaths } from './edits'

test('changedPaths: 편집 툴은 성공했을 때만 입력 경로를 돌려준다', () => {
  expect(changedPaths('Write', { file_path: 'a.md' }, {}, false)).toEqual(['a.md'])
  expect(changedPaths('Edit', { file_path: 'a.md' }, {}, true)).toEqual([])
  expect(changedPaths('NotebookEdit', { notebook_path: 'n.ipynb' }, {}, false)).toEqual(['n.ipynb'])
})

test('changedPaths: Bash 는 결과의 bashEditDiff 를 쓰고 다른 툴은 빈 배열', () => {
  const result = { bashEditDiff: { files: [], moreFiles: 0, changedFiles: ['/r/a.md'] } }

  expect(changedPaths('Bash', { command: 'echo > a.md' }, result, false)).toEqual(['/r/a.md'])
  expect(changedPaths('Read', { file_path: 'a.md' }, {}, false)).toEqual([])
})

test('bashChangedFiles: Bash 결과의 changedFiles 를 꺼낸다', () => {
  const result = { stdout: '', bashEditDiff: { files: [], moreFiles: 0, changedFiles: ['C:/r/a.md', 'C:/r/b.md'] } }

  expect(bashChangedFiles(result)).toEqual(['C:/r/a.md', 'C:/r/b.md'])
})

test('bashChangedFiles: changedFiles 가 없으면 files 의 filePath 를 쓴다', () => {
  const result = { bashEditDiff: { files: [{ filePath: '/r/a.md', hunks: [] }], moreFiles: 0 } }

  expect(bashChangedFiles(result)).toEqual(['/r/a.md'])
})

test('bashChangedFiles: 정보가 없으면 빈 배열', () => {
  expect(bashChangedFiles({ stdout: 'hi' })).toEqual([])
  expect(bashChangedFiles(undefined)).toEqual([])
})
