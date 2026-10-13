import { expect, test } from 'claude-code/testing'

import * as C from '../config'

/** 대화 옆에 붙은 56칸 대시보드 패널 */
const PANE = {
  plugin: 'snitch',
  surface: 'terminal',
  component: 'Pane',
  requestId: C.PANE_ID,
  props: {
    title: C.PANE_TITLE,
    isFocused: false,
    bodyColumns: 56,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('홈은 비어 있어도 칸 네 개를 그리고 칸을 누르면 그 화면으로 이동한다', async $ => {
  const ui = await $.ui.mount(PANE)
  for (const key of ['tile-name-todos', 'tile-name-decisions', 'tile-name-agents', 'tile-name-links']) {
    expect(await ui.find({ key })).toBeDefined()
  }
  expect((await ui.find({ key: 'tile-count-decisions' }))?.text).toBe('0개')

  await ui.press({ key: 'tile-name-decisions' })
  await ui.redraw()
  expect(await ui.find({ key: 'crumb-home' })).toBeDefined()
  expect(await ui.find({ text: /답을 기다리는 결정 없음/ })).toBeDefined()

  await ui.press({ key: 'crumb-home' })
  await ui.redraw()
  expect(await ui.find({ key: 'tile-name-todos' })).toBeDefined()
  await ui.unmount()
})

test('대화 옆 패널은 머리줄에 접기 버튼이 있다', async $ => {
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'fold' })).toBeDefined()
  await ui.unmount()
})

test('입력창 위에 놓인 패널은 접기 버튼이 없다', async $ => {
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, placement: 'inline' } })
  expect(await ui.find({ key: 'fold' })).toBeUndefined()
  await ui.unmount()
})
