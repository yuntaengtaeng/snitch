import * as C from '../config'
import type { Host } from '../host'
import { statusText, type RateLimit } from './text'

/** 상태줄의 모델, effort, 한도, 명령 수 상태와 표시 */
export function createStatusLine(deps: { getHost: () => Host | null; editedCount: () => number }) {
  let model: string | null = null
  let effort: string | null = null
  let rateLimits: RateLimit[] = []
  let commands = 0

  function update() {
    const host = deps.getHost()
    if (!host || !C.ENABLE.statusLine) return
    const showModel = C.ENABLE.modelEffort
    host.status(
      statusText({
        model: showModel ? model : null,
        effort: showModel ? effort : null,
        rateLimits,
        editedFiles: deps.editedCount(),
        commands,
      }),
    )
  }

  return {
    update,

    /** 세션 시작 시 모델과 명령 수 초기화 */
    start() {
      model = null
      effort = null
      commands = 0
    },

    /** /clear, /resume 시 명령 수 초기화 */
    clear() {
      commands = 0
    },

    /** 메인 대화 요청의 모델과 effort 반영 */
    stepped(nextModel: string, nextEffort: string | null) {
      if (!C.ENABLE.statusLine || !C.ENABLE.modelEffort) return
      if (nextModel === model && nextEffort === effort) return
      model = nextModel
      effort = nextEffort
      update()
    },

    measured(next: RateLimit[]) {
      if (!C.ENABLE.statusLine) return
      rateLimits = next
      update()
    },

    commandRan() {
      commands += 1
    },
  }
}
