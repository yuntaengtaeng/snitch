import type { On } from 'claude-code'

import { MAIN_ID } from './agents/roster'
import type { App } from './app'
import { makesSomething } from './board/board'
import { isBoardEmpty } from './board/view'
import * as C from './config'
import { changedPaths } from './work-files/edits'

/** 툴 호출마다 에이전트 활동 기록, 만든 결과물 링크 수집, 바뀐 파일 추적, Bash 뒤 커밋 감지 */
export function registerToolActivityHooks(on: On, app: App) {
  const { agents, board, workFiles, reasons } = app

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r

    const input = e as unknown as Record<string, unknown>
    if (e.tool !== C.NOTE_TOOL_ID && e.tool !== C.BOARD_TOOL_ID) agents.acted(e.agentId, e.tool, input)

    const madeText = 'text' in r && r.isError !== true ? r.text : undefined
    if (C.ENABLE.board && !e.agentId && madeText && makesSomething(e.tool, input)) {
      const wasEmpty = isBoardEmpty(board.view().board)
      board.captureLinks(madeText)
      app.openIfFirstPin(wasEmpty)
    }

    for (const path of changedPaths(e.tool, input, r.result, r.isError === true)) {
      const rel = workFiles.track(path, e.agentId ?? MAIN_ID)
      if (rel !== null) reasons.noteEdit(rel)
    }

    if (e.tool === 'Bash') {
      const command = typeof input['command'] === 'string' ? input['command'] : ''
      void workFiles.afterBash(command).catch(() => undefined)
    }
    return r
  })
}
