import * as C from '../config'
import type { Host } from '../host'
import { parseReasons, reasonPrompt, REASON_SYSTEM, tidyReason, type ChangedFile } from './prompt'

export type ReasonsView = {
  /** 파일별 변경 이유 한 줄 (레포 기준 경로) */
  reasons: ReadonlyMap<string, string>
  /** 변경 이유를 요약하는 중인 파일 */
  explaining: ReadonlySet<string>
}

/** 작성자가 남긴 변경 메모 보관, 메모 없는 파일은 메인 대화 턴이 끝날 때 모델 한 번 호출로 요약 */
export function createReasons(deps: {
  getHost: () => Host | null
  /** 파일 하나의 HEAD 대비 변경 내용, 변경 없으면 null */
  changeOf: (rel: string) => Promise<string | null>
  /** 화면 갱신 요청 */
  onChange: () => void
}) {
  const reasons = new Map<string, string>()
  const explaining = new Set<string>()
  /** 메모도 요약도 아직 없는 편집 파일 */
  const pending = new Set<string>()
  let request = ''

  async function explain(paths: string[], answer: string) {
    const host = deps.getHost()
    if (!host) return
    paths.forEach(p => explaining.add(p))
    deps.onChange()
    try {
      const files: ChangedFile[] = []
      for (const path of paths) {
        const diff = await deps.changeOf(path)
        if (diff !== null) files.push({ path, diff })
      }
      if (files.length === 0) return

      const prompt = reasonPrompt(request, answer, files, {
        diffChars: C.REASON_DIFF_CHARS,
        reasonChars: C.REASON_MAX_CHARS,
      })
      const text = await host.complete(prompt, REASON_SYSTEM)
      if (text === null) return
      const found = parseReasons(text, files.map(f => f.path), C.REASON_MAX_CHARS)
      for (const [path, reason] of found) reasons.set(path, reason)
    } finally {
      paths.forEach(p => explaining.delete(p))
      deps.onChange()
    }
  }

  return {
    /** 변경 이유의 근거가 될 사용자 요청 기록, 빈 요청이면 이전 요청 유지 */
    noteRequest(text: string) {
      if (text.trim()) request = text
    },

    noteEdit(rel: string) {
      pending.add(rel)
    },

    /** 코드를 고친 Claude 가 change_note 로 남긴 이유 반영, 반영한 개수 반환 */
    noted(notes: { rel: string; reason: string }[]): number {
      let count = 0
      for (const { rel, reason } of notes) {
        const tidy = tidyReason(reason)
        if (!tidy) continue
        reasons.set(rel, tidy.length > C.REASON_MAX_CHARS ? `${tidy.slice(0, C.REASON_MAX_CHARS - 1)}…` : tidy)
        pending.delete(rel)
        count += 1
      }
      if (count > 0) deps.onChange()
      return count
    },

    /** 메인 대화 턴 종료 시 메모 없이 남은 편집 파일의 이유 요약 시작 */
    turnEnded(answer: string) {
      if (pending.size === 0) return
      const paths = [...pending]
      pending.clear()
      if (C.ENABLE.workFiles && C.ENABLE.changeReasons) {
        void explain(paths, answer).catch(() => undefined)
      }
    },

    /** /changes why 로 요청한 파일들의 이유 즉시 다시 요약, 자동 요약 설정과 무관 */
    explainNow(paths: string[]) {
      paths.forEach(p => pending.delete(p))
      void explain(paths, '').catch(() => undefined)
    },

    /** 커밋된 파일의 이유 삭제 */
    forget(paths: string[]) {
      paths.forEach(p => reasons.delete(p))
    },

    clear() {
      reasons.clear()
      explaining.clear()
      pending.clear()
    },

    view: (): ReasonsView => ({ reasons, explaining }),
  }
}
