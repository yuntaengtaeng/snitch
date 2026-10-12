import { expect, test } from 'claude-code/testing'

import { diffParts, hunkRange, splitHunks } from './diff'
import { editRequestText } from './request'

const DIFF = [
  'diff --git a/login.ts b/login.ts',
  'index 1111111..2222222 100644',
  '--- a/login.ts',
  '+++ b/login.ts',
  '@@ -10,3 +10,4 @@ function login() {',
  ' const a = 1',
  '-retry()',
  '+showError()',
  '+setLoading(false)',
  '@@ -40,2 +41,0 @@',
  '-old()',
  '-old2()',
  '',
].join('\n')

test('splitHunks: 파일 머리글을 버리고 hunk 별로 나눈다', () => {
  const hunks = splitHunks(DIFF)
  expect(hunks.length).toBe(2)
  expect(hunks[0]?.startsWith('@@ -10,3 +10,4 @@')).toBe(true)
  expect(hunks[1]).toBe('@@ -40,2 +41,0 @@\n-old()\n-old2()')
})

test('hunkRange: 새 버전 기준 줄 범위, 삭제만 있으면 근처', () => {
  expect(hunkRange('@@ -10,3 +10,4 @@')).toBe('10-13줄')
  expect(hunkRange('@@ -5 +5 @@')).toBe('5줄')
  expect(hunkRange('@@ -40,2 +41,0 @@')).toBe('41줄 근처')
})

test('diffParts: 글자 수를 넘는 뒤쪽 hunk 는 자르지 않고 생략한다', () => {
  const all = diffParts({ isNew: false, text: DIFF }, 10_000)
  expect(all.parts.map(p => p.range)).toEqual(['10-13줄', '41줄 근처'])
  expect(all.omitted).toBe(null)

  const first = splitHunks(DIFF)[0] ?? ''
  const clipped = diffParts({ isNew: false, text: DIFF }, first.length + 5)
  expect(clipped.parts.length).toBe(1)
  expect(clipped.omitted).toBe('나머지 1개 부분 생략')
})

test('diffParts: 새 파일은 본문 하나, 길면 줄 단위로 자른다', () => {
  const small = diffParts({ isNew: true, text: 'a\nb\n' }, 100)
  expect(small.parts).toEqual([{ index: 0, code: 'a\nb\n', format: 'source', range: '1-2줄' }])

  const big = diffParts({ isNew: true, text: 'aaaa\nbbbb\ncccc\n' }, 7)
  expect(big.parts[0]?.code).toBe('aaaa')
  expect(big.omitted).toBe('뒤 2줄 생략')
})

test('diffParts: hunk 가 없는 바이너리 변경은 빈 조각', () => {
  expect(diffParts({ isNew: false, text: 'Binary files a/x.png and b/x.png differ\n' }, 100).parts).toEqual([])
})

test('수정 요청: 문구 앞에 경로와 줄 범위', () => {
  const part = diffParts({ isNew: false, text: DIFF }, 10_000).parts[0]
  if (!part) throw new Error('조각 없음')
  expect(editRequestText('src/login.ts', part, '  기존 방식으로 수정해줘 ')).toBe('[src/login.ts 10-13줄] 기존 방식으로 수정해줘')
})
