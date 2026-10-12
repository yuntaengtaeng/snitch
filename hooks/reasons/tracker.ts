import * as C from '../config'
import type { Host } from '../host'
import type { FileChange } from '../work-files/git'
import { addEntry, replaceLatest, type ReasonEntry } from './history'
import { changeText, parseReasons, reasonPrompt, REASON_SYSTEM, tidyReason, type ChangedFile } from './prompt'

export type ReasonsView = {
  /** 파일별 요청 순서대로 쌓인 변경 이유 (레포 기준 경로) */
  history: ReadonlyMap<string, readonly ReasonEntry[]>
  /** 변경 이유를 요약하는 중인 파일 */
  explaining: ReadonlySet<string>
}

/** 파일의 가장 최근 변경 이유, 없으면 undefined */
export function latestReason(view: ReasonsView, path: string): string | undefined {
  const entries = view.history.get(path)
  return entries?.[entries.length - 1]?.reason
}

/** 이유를 기록할 요청 */
type Request = { id: number; text: string }

/** 작성자가 남긴 변경 메모를 요청별로 쌓고, 메모 없는 파일은 메인 대화 턴이 끝날 때 그 턴의 변경만 모델로 요약 */
export function createReasons(deps: {
  getHost: () => Host | null
  /** blob 이후 바뀐 내용, blob 이 null 이면 HEAD 대비 변경 내용 */
  changeSince: (rel: string, blob: string | null) => Promise<FileChange | null>
  /** 지금 파일 내용의 blob id, 파일이 없으면 null */
  snapshot: (rel: string) => Promise<string | null>
  /** 화면 갱신 요청 */
  onChange: () => void
}) {
  const history = new Map<string, ReasonEntry[]>()
  const explaining = new Set<string>()
  /** 마지막 메인 턴 종료 이후 편집한 파일 */
  const edited = new Set<string>()
  /** edited 중 메모가 없는 파일 */
  const pending = new Set<string>()
  /** 마지막 메인 턴 종료 시점의 파일 내용 blob, 다음 턴 요약의 비교 기준 */
  const baseline = new Map<string, string>()
  let request: Request = { id: 0, text: '' }

  function record(rel: string, reason: string, source: ReasonEntry['source'], at: Request) {
    const entry = { requestId: at.id, request: at.text, reason, source }
    history.set(rel, addEntry(history.get(rel) ?? [], entry))
  }

  async function changesOf(paths: string[], since: (rel: string) => string | null): Promise<ChangedFile[]> {
    const files: ChangedFile[] = []
    for (const path of paths) {
      const change = await deps.changeSince(path, since(path))
      if (change !== null) files.push({ path, diff: changeText(change) })
    }
    return files
  }

  async function rememberBaseline(paths: string[]) {
    for (const path of paths) {
      const blob = await deps.snapshot(path)
      if (blob === null) baseline.delete(path)
      else baseline.set(path, blob)
    }
  }

  /** 모델 한 번 호출로 파일들의 이유 요약, latest 면 마지막 이력의 이유만 교체 */
  async function summarize(files: ChangedFile[], answer: string, at: Request, mode: 'add' | 'latest') {
    const host = deps.getHost()
    if (!host || files.length === 0) return
    const paths = files.map(f => f.path)
    paths.forEach(p => explaining.add(p))
    deps.onChange()
    try {
      const prompt = reasonPrompt(at.text, answer, files, {
        diffChars: C.REASON_DIFF_CHARS,
        reasonChars: C.REASON_MAX_CHARS,
      })
      const text = await host.complete(prompt, REASON_SYSTEM)
      if (text === null) return
      for (const [path, reason] of parseReasons(text, paths, C.REASON_MAX_CHARS)) {
        if (mode === 'add') record(path, reason, 'summary', at)
        else {
          const fallback = { requestId: at.id, request: at.text, reason, source: 'summary' as const }
          history.set(path, replaceLatest(history.get(path) ?? [], fallback))
        }
      }
    } finally {
      paths.forEach(p => explaining.delete(p))
      deps.onChange()
    }
  }

  /** 턴의 변경 내용을 먼저 읽고 기준을 옮긴 뒤 요약, 요약 중 다음 턴 편집이 섞이지 않게 함 */
  async function closeTurn(paths: string[], unexplained: string[], answer: string, at: Request) {
    const files = await changesOf(unexplained, p => baseline.get(p) ?? null)
    await rememberBaseline(paths)
    await summarize(files, answer, at, 'add')
  }

  return {
    /** 변경 이유의 근거가 될 사용자 요청 기록, 빈 요청이면 이전 요청 유지 */
    noteRequest(text: string) {
      if (text.trim()) request = { id: request.id + 1, text }
    },

    noteEdit(rel: string) {
      edited.add(rel)
      pending.add(rel)
    },

    /** 코드를 고친 Claude 가 change_note 로 남긴 이유 반영, 반영한 개수 반환 */
    noted(notes: { rel: string; reason: string }[]): number {
      let count = 0
      for (const { rel, reason } of notes) {
        const tidy = tidyReason(reason)
        if (!tidy) continue
        const clipped = tidy.length > C.REASON_MAX_CHARS ? `${tidy.slice(0, C.REASON_MAX_CHARS - 1)}…` : tidy
        record(rel, clipped, 'note', request)
        pending.delete(rel)
        count += 1
      }
      if (count > 0) deps.onChange()
      return count
    },

    /** 메인 대화 턴 종료 시 메모 없이 남은 편집 파일의 이유 요약과 다음 턴 비교 기준 저장 */
    turnEnded(answer: string) {
      if (edited.size === 0) return
      const paths = [...edited]
      const canSummarize = C.ENABLE.workFiles && C.ENABLE.changeReasons
      const unexplained = canSummarize ? [...pending] : []
      edited.clear()
      pending.clear()
      void closeTurn(paths, unexplained, answer, request).catch(() => undefined)
    },

    /** /snitch why 로 요청한 파일들의 최근 이유를 HEAD 대비 변경으로 다시 요약, 자동 요약 설정과 무관 */
    explainNow(paths: string[]) {
      paths.forEach(p => pending.delete(p))
      void changesOf(paths, () => null)
        .then(files => summarize(files, '', request, 'latest'))
        .catch(() => undefined)
    },

    /** 커밋된 파일의 이력과 비교 기준 삭제 */
    forget(paths: string[]) {
      paths.forEach(p => {
        history.delete(p)
        baseline.delete(p)
      })
    },

    clear() {
      history.clear()
      explaining.clear()
      edited.clear()
      pending.clear()
      baseline.clear()
    },

    view: (): ReasonsView => ({ history, explaining }),
  }
}
