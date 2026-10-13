import { expect, test } from 'claude-code/testing'

import type { Host } from '../host'
import { createPaneController } from './controller'

/** 열기 요청을 기록하는 패널 컨트롤러 */
function setup() {
  const opened: number[] = []
  const host = {
    openPane: async (rows: number) => {
      opened.push(rows)
      return { isPlaced: true }
    },
  } as unknown as Host
  const pane = createPaneController({ getHost: () => host, rows: () => 10, allowsAutoOpen: () => true })
  return { pane, opened }
}

test('autoOpen: 넓은 창에서 세션당 한 번만 연다', () => {
  const { pane, opened } = setup()
  pane.autoOpen()
  pane.sawViewport(true)
  pane.autoOpen()
  pane.closed()
  pane.autoOpen()
  expect(opened).toEqual([10])
})

test('sawPlacement: 마지막으로 그린 패널이 사이드바였는지 기억한다', () => {
  const { pane } = setup()
  pane.sawPlacement(true)
  expect(pane.isDocked()).toBe(true)
  pane.sawPlacement(false)
  expect(pane.isDocked()).toBe(false)
})

test('openUnasked: 좁은 창에서는 열지 않고 아이콘 줄에 맡긴다', () => {
  const { pane, opened } = setup()
  pane.sawViewport(false)
  pane.openUnasked()
  expect(opened).toEqual([])
  expect(pane.isOpen()).toBe(false)
})
