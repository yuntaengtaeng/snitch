import * as C from '../config'
import type { Host } from '../host'
import { statusText, type RateLimit } from './text'

/** 상태줄의 모델, effort, 요금제 한도 상태와 표시 */
export function createStatusLine(deps: {
  getHost: () => Host | null
  /** 상태줄 끝에 붙일 보드 요약 */
  boardParts: () => string[]
}) {
  let model: string | null = null
  let effort: string | null = null
  let rateLimits: RateLimit[] = []

  function update() {
    const host = deps.getHost()
    if (!host || !C.ENABLE.statusLine) return
    const showModel = C.ENABLE.modelEffort
    const text = statusText({
      model: showModel ? model : null,
      effort: showModel ? effort : null,
      rateLimits,
      now: Date.now(),
      board: deps.boardParts(),
    })
    host.status(text || undefined)
  }

  return {
    update,

    /** 세션 시작 시 모델과 effort 초기화 */
    start() {
      model = null
      effort = null
    },

    /** 메인 대화 요청의 모델과 effort 반영 */
    stepped(nextModel: string, nextEffort: string | null) {
      if (nextModel === model && nextEffort === effort) return
      model = nextModel
      effort = nextEffort
      update()
    },

    /** 요금제 한도 반영, 대시보드도 이 값을 씀 */
    measured(next: RateLimit[]) {
      rateLimits = next
      update()
    },

    limits: (): readonly RateLimit[] => rateLimits,
  }
}
