import type { On } from 'claude-code'

import { createApp } from './app'
import { boardPromptSection, registerBoardHooks } from './board/hooks'
import { registerPaneHooks } from './pane/hooks'
import { registerPromptHooks } from './prompt-hooks'
import { notePromptSection, registerReasonHooks } from './reasons/hooks'
import { registerSessionHooks } from './session-hooks'
import { registerToolActivityHooks } from './tool-activity-hooks'

/** snitch: 기능별 상태를 만들고 Claude Code 이벤트를 상태줄, 작업 파일, 변경 이유, 보드, 에이전트, 대시보드 패널에 연결 */
export function register(on: On) {
  const app = createApp()
  registerSessionHooks(on, app)
  registerPromptHooks(on, [notePromptSection, boardPromptSection(app)])
  registerReasonHooks(on, app)
  registerBoardHooks(on, app)
  registerToolActivityHooks(on, app)
  registerPaneHooks(on, app)
}
