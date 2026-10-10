import { expect, test } from 'claude-code/testing'

import { isUserRequest } from './prompt-origin'

test('isUserRequest: 직접 입력한 요청만 새 요청으로 본다', () => {
  expect(isUserRequest('composer')).toBe(true)
  expect(isUserRequest('bridge')).toBe(true)
  expect(isUserRequest('task-notification')).toBe(false)
  expect(isUserRequest('scheduled-trigger')).toBe(false)
  expect(isUserRequest('peer')).toBe(false)
})
