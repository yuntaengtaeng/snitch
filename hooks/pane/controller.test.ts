import { expect, test } from 'claude-code/testing'

import type { Host } from '../host'
import { createPaneController, PANE_WAITING_TOAST } from './controller'

/** 열기 요청과 토스트를 기록하는 패널 컨트롤러 */
function setup(isPlaced: boolean) {
  const toasts: string[] = []
  const opened: number[] = []
  const host = {
    openPane: async (rows: number) => {
      opened.push(rows)
      return { isPlaced }
    },
    toast: (text: string) => toasts.push(text),
  } as unknown as Host
  const pane = createPaneController({ getHost: () => host, rows: () => 10, allowsAutoOpen: () => true })
  return { pane, toasts, opened }
}

test('autoOpen: 전체화면에서 세션당 한 번만 연다', async () => {
  const { pane, opened } = setup(true)
  pane.autoOpen(false)
  pane.autoOpen(true)
  pane.closed()
  pane.autoOpen(true)
  await Promise.resolve()
  expect(opened).toEqual([10])
})

test('openUnasked: 엔진이 배치하지 않으면 여는 방법을 토스트로 안내한다', async () => {
  const { pane, toasts } = setup(false)
  pane.openUnasked()
  await Promise.resolve()
  await Promise.resolve()
  expect(toasts).toEqual([PANE_WAITING_TOAST])
  expect(pane.isOpen()).toBe(true)
})
