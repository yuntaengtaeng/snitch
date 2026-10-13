import { expect, test } from 'claude-code/testing'

import { backAction, closeOutcome, HOME, quickBarMode, unfoldTo } from './navigation'

test('backAction: 다른 화면은 홈으로, 홈이면 닫는다', () => {
  expect(backAction({ ...HOME, screen: 'todos' })).toBe('home')
  expect(backAction(HOME)).toBe('close')
})

test('backAction: 아이콘 줄로 잠깐 연 화면은 바로 닫는다', () => {
  expect(backAction({ screen: 'files', isFolded: false, isDirect: true, isQuick: true })).toBe('close')
})

test('unfoldTo: 접힌 줄의 홈은 그냥 펼치고 다른 아이콘은 Esc 때 다시 접는다', () => {
  expect(unfoldTo('home')).toEqual(HOME)
  expect(backAction(unfoldTo('decisions'))).toBe('fold')
})

test('closeOutcome: 사용자가 사이드바 홈을 닫으면 아이콘 줄로 접고 입력창 위 패널은 닫는다', () => {
  const person = { isPerson: true, isDetailOpen: false }
  expect(closeOutcome(HOME, { ...person, isDocked: true })).toBe('fold')
  expect(closeOutcome(HOME, { ...person, isDocked: false })).toBe('close')
  expect(closeOutcome({ ...HOME, screen: 'links' }, { ...person, isDocked: true })).toBe('home')
  expect(closeOutcome(HOME, { ...person, isDetailOpen: true, isDocked: true })).toBe('back-to-list')
  expect(closeOutcome(HOME, { isPerson: false, isDetailOpen: false, isDocked: true })).toBe('close')
})

test('quickBarMode: 접혔으면 접힌 줄, 좁은 창이면 좁은 줄, 패널이 열렸거나 넓은 창이면 없음', () => {
  const base = { hasRepo: true, hasSurvey: false, isPaneOpen: false, isFolded: false, isWide: false }
  expect(quickBarMode(base)).toBe('narrow')
  expect(quickBarMode({ ...base, isWide: true })).toBe('none')
  expect(quickBarMode({ ...base, isWide: true, isFolded: true })).toBe('folded')
  expect(quickBarMode({ ...base, isPaneOpen: true })).toBe('none')
  expect(quickBarMode({ ...base, hasRepo: false })).toBe('none')
})
