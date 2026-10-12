import { expect, test } from 'claude-code/testing'

import { limitGauge, resetText, statusText } from './text'

const NOW = new Date(2026, 9, 12, 13, 0).getTime()

test('limitGauge: 사용률을 남은 한도 막대와 단계로 바꾼다', () => {
  expect(limitGauge({ kind: 'five_hour', percentUsed: 62 }, 6, NOW)).toEqual({
    label: '5h',
    remaining: 38,
    bar: '▰▰▱▱▱▱',
    level: 'half',
    reset: '',
  })
  expect(limitGauge({ kind: 'seven_day', percentUsed: 10 }, 6, NOW).level).toBe('plenty')
  expect(limitGauge({ kind: 'seven_day', percentUsed: 85 }, 6, NOW).level).toBe('low')
})

test('limitGauge: 범위를 벗어난 사용률은 0~100 으로 자른다', () => {
  expect(limitGauge({ kind: 'five_hour', percentUsed: 130 }, 4, NOW)).toMatchObject({ remaining: 0, bar: '▱▱▱▱' })
  expect(limitGauge({ kind: 'other', percentUsed: -5 }, 4, NOW)).toMatchObject({ label: 'other', remaining: 100, bar: '▰▰▰▰' })
})

test('statusText: 모델과 effort, 남은 한도만 보여 준다', () => {
  const text = statusText({
    model: 'claude-opus-5-5',
    effort: 'high',
    rateLimits: [
      { kind: 'five_hour', percentUsed: 62 },
      { kind: 'seven_day', percentUsed: 31 },
    ],
    now: NOW,
  })

  expect(text).toBe('Opus 5.5 high  |  남은 한도 5h 38%, 7d 69%')
  expect(statusText({ model: null, rateLimits: [], now: NOW })).toBe('')
})

test('statusText: 초기화 시각을 알면 한도 뒤에 붙인다', () => {
  const text = statusText({
    rateLimits: [
      { kind: 'five_hour', percentUsed: 62, resetsAt: new Date(2026, 9, 12, 15, 40).toISOString() },
      { kind: 'seven_day', percentUsed: 31, resetsAt: new Date(2026, 9, 15, 9, 0).toISOString() },
    ],
    now: NOW,
  })
  expect(text).toBe('남은 한도 5h 38% 15:40 초기화, 7d 69% 10/15 초기화')
})

test('resetText: 하루 안이면 시:분, 그 뒤면 월/일, 지났거나 모르면 빈 문자열', () => {
  expect(resetText(new Date(2026, 9, 12, 9, 5).toISOString(), NOW)).toBe('')
  expect(resetText(new Date(2026, 9, 13, 9, 5).toISOString(), NOW)).toBe('09:05')
  expect(resetText(new Date(2026, 9, 14, 9, 5).toISOString(), NOW)).toBe('10/14')
  expect(resetText(undefined, NOW)).toBe('')
  expect(resetText('잘못된 값', NOW)).toBe('')
})
