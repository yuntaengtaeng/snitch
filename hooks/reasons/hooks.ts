import type { On } from 'claude-code'

import type { App } from '../app'
import * as C from '../config'
import type { PromptSection } from '../prompt-hooks'
import { NOTE_PROMPT, parseNotes } from './note-tool'

/** 변경 메모 도구가 제공될 때만 붙이는 안내 */
export const notePromptSection: PromptSection = tools =>
  tools.includes(C.NOTE_TOOL_ID) ? { id: 'snitch:change-note', text: NOTE_PROMPT } : null

/** Claude 가 남긴 변경 메모를 변경 이유로 반영 */
export function registerReasonHooks(on: On, app: App) {
  const { workFiles, reasons } = app

  /** 변경 메모 도구 호출에 응답하고 메모를 변경 이유로 반영 */
  on('tool.call', { tool: C.NOTE_TOOL_ID }, async ($, e, next) => {
    const notes = parseNotes(e as unknown as Record<string, unknown>).flatMap(n => {
      const rel = workFiles.repoPathOf(n.path)
      return rel === null ? [] : [{ rel, reason: n.reason }]
    })
    const count = reasons.noted(notes)
    return { result: count > 0 ? `변경 메모 ${count}개 기록` : '기록할 변경 메모 없음, 레포 안 파일 경로와 이유 확인 필요' }
  })
}
