import type { On } from 'claude-code'

import type { App } from '../app'
import * as C from '../config'
import type { PromptSection } from '../prompt-hooks'
import { asksUser, parseUpdate, updateSummary } from './board'
import { BOARD_PROMPT, NUDGE } from './tool'
import { isBoardEmpty } from './view'

/** 보드 도구가 제공될 때만 붙이는 사용 규칙과 지금 보드 */
export function boardPromptSection(app: App): PromptSection {
  return tools => (tools.includes(C.BOARD_TOOL_ID) ? { id: 'snitch:board', text: `${BOARD_PROMPT}\n${app.board.describe()}` } : null)
}

/** 보드 도구 호출 반영과 표시, 질문으로 끝난 응답 되돌리기 */
export function registerBoardHooks(on: On, app: App) {
  const { board } = app

  /** 보드 도구 호출 반영, 서브에이전트는 거부 */
  on('tool.call', { tool: C.BOARD_TOOL_ID }, async ($, e, next) => {
    if (e.agentId) return { deny: '보드는 메인 대화만 고칠 수 있음' }
    const wasEmpty = isBoardEmpty(board.view().board)
    const result = board.apply(parseUpdate(e as unknown as Record<string, unknown>))
    app.openIfFirstPin(wasEmpty)
    return { result }
  })

  /** 질문으로 끝난 응답인데 열린 결정이 없으면 한 번 돌려보내 결정으로 남기게 함 */
  on('classic.Stop', async ($, e, next) => {
    const ran = await next(e)
    if (!C.ENABLE.board || ran.block || e.stop_hook_active) return ran
    if (!asksUser(e.last_assistant_message ?? '') || board.hasOpenDecision()) return ran
    return { ...ran, block: NUDGE }
  })

  /** 보드 도구 호출은 대화창에 흐린 한 줄로만 표시 */
  on('ui.render', { component: 'ToolUse', props: { tool: C.BOARD_TOOL_ID } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const change = parseUpdate((e.props.input ?? {}) as Record<string, unknown>)
    return <Text dimColor>{updateSummary(change)}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: C.BOARD_TOOL_ID } }, async ($, e, next) =>
    e.props.isErrored ? next(e) : $.ui.resolve(e).Text({ children: [''] }),
  )
}
