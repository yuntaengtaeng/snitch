import { expect, test } from 'claude-code/testing'

import { limitGauge } from './text'

test('limitGauge: 사용률을 남은 한도 막대와 단계로 바꾼다', () => {
  expect(limitGauge({ kind: 'five_hour', percentUsed: 62 }, 6)).toEqual({
    label: '5h',
    remaining: 38,
    bar: '▰▰▱▱▱▱',
    level: 'half',
  })
  expect(limitGauge({ kind: 'seven_day', percentUsed: 10 }, 6).level).toBe('plenty')
  expect(limitGauge({ kind: 'seven_day', percentUsed: 85 }, 6).level).toBe('low')
})

test('limitGauge: 범위를 벗어난 사용률은 0~100 으로 자른다', () => {
  expect(limitGauge({ kind: 'five_hour', percentUsed: 130 }, 4)).toMatchObject({ remaining: 0, bar: '▱▱▱▱' })
  expect(limitGauge({ kind: 'other', percentUsed: -5 }, 4)).toMatchObject({ label: 'other', remaining: 100, bar: '▰▰▰▰' })
})
