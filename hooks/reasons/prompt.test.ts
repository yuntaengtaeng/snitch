import { expect, test } from 'claude-code/testing'

import { parseReasons, reasonPrompt, tidyReason } from './prompt'

const LIMITS = { diffChars: 12_000, reasonChars: 40 }

test('reasonPrompt: 사용자 요청, 답변, 파일별 diff 를 모두 담는다', () => {
  const prompt = reasonPrompt('로그인 버그 고쳐줘', '리다이렉트를 고쳤어요', [
    { path: 'src/login.ts', diff: '-a\n+b' },
  ], LIMITS)

  expect(prompt).toContain('로그인 버그 고쳐줘')
  expect(prompt).toContain('리다이렉트를 고쳤어요')
  expect(prompt).toContain('=== src/login.ts ===\n-a\n+b')
  expect(prompt).toContain('40자 이내')
})

test('reasonPrompt: 긴 diff 는 잘라낸다', () => {
  const prompt = reasonPrompt('', '', [{ path: 'a.ts', diff: 'x'.repeat(5_000) }], {
    diffChars: 1_000,
    reasonChars: 40,
  })

  expect(prompt).toContain('…(생략)')
  expect(prompt.length).toBeLessThan(2_000)
})

test('parseReasons: JSON 객체에서 물어본 파일의 이유만 꺼낸다', () => {
  const text = '```json\n{"a.ts": "로그인 실패 시 안내 추가", "zzz.ts": "묻지 않음"}\n```'

  const reasons = parseReasons(text, ['a.ts', 'b.ts'], 40)

  expect([...reasons]).toEqual([['a.ts', '로그인 실패 시 안내 추가']])
})

test('parseReasons: 공백을 한 줄로 합치고 너무 긴 이유는 자른다', () => {
  const reasons = parseReasons('{"a.ts": "  줄\\n바꿈  이유가  아주 길다 "}', ['a.ts'], 8)

  expect(reasons.get('a.ts')).toBe('줄 바꿈 이유…')
})

test('parseReasons: JSON 이 아니면 빈 결과', () => {
  expect(parseReasons('요약할 수 없어요', ['a.ts'], 40).size).toBe(0)
  expect(parseReasons('{깨진 json}', ['a.ts'], 40).size).toBe(0)
})

test('tidyReason: 끝 마침표, 가운뎃점, 화살표, 따옴표를 걷어 낸다', () => {
  expect(tidyReason('"README 설명 추가."')).toBe('README 설명 추가')
  expect(tidyReason('회의 결정 · 할 일 공유')).toBe('회의 결정, 할 일 공유')
  expect(tidyReason('설정 → 상태줄 반영')).toBe('설정 상태줄 반영')
})
