import * as C from '../config'
import type { Host } from '../host'
import type { FileChange } from '../work-files/git'
import { diffParts, type DiffParts } from './diff'
import { editRequestText } from './request'

export type FileDetailView = {
  /** 상세 화면으로 연 파일 (레포 기준 경로), 목록 화면이면 null */
  path: string | null
  /** 변경 조각, 처음 불러오는 중이면 null */
  diff: DiffParts | null
  /** 수정 요청 입력칸을 연 조각 순번 */
  asking: number | null
  /** 마지막으로 보낸 요청 문구 */
  sent: string | null
}

/** 파일 상세 화면의 선택 파일, 변경 조각, 수정 요청 입력과 전송 */
export function createFileDetail(deps: {
  getHost: () => Host | null
  /** 파일 하나의 HEAD 대비 변경 내용, 변경 없으면 null */
  changeOf: (rel: string) => Promise<FileChange | null>
  /** 수정 요청을 보내기 직전, 변경 이유의 근거 요청으로 기록 */
  onSent: (text: string) => void
  /** 화면 갱신 요청 */
  onChange: () => void
}) {
  let path: string | null = null
  let diff: DiffParts | null = null
  let asking: number | null = null
  let sent: string | null = null

  async function load() {
    const target = path
    if (target === null) return
    const change = await deps.changeOf(target).catch(() => null)
    if (path !== target) return
    diff = change === null ? { parts: [], omitted: null } : diffParts(change, C.DETAIL_DIFF_CHARS)
    if (asking !== null && asking >= diff.parts.length) asking = null
    deps.onChange()
  }

  return {
    open(rel: string) {
      path = rel
      diff = null
      asking = null
      sent = null
      deps.onChange()
      void load()
    },

    close() {
      path = null
      diff = null
      asking = null
      sent = null
    },

    /** 열린 파일의 변경 조각 다시 읽기, 읽는 동안 이전 조각 유지 */
    refresh() {
      if (path !== null) void load()
    },

    /** 조각 하나의 수정 요청 입력칸 열기, 같은 조각이면 닫기 */
    ask(index: number) {
      asking = asking === index ? null : index
      deps.onChange()
    },

    /** 입력한 수정 요청을 경로와 줄 범위를 붙여 사용자 요청으로 전송 */
    send(index: number, instruction: string) {
      const host = deps.getHost()
      const part = diff?.parts[index]
      if (!host || path === null || !part || !instruction.trim()) return
      const text = editRequestText(path, part, instruction)
      deps.onSent(text)
      asking = null
      sent = text
      deps.onChange()
      void host.submitPrompt(text).catch(() => {
        sent = null
        deps.onChange()
      })
    },

    view: (): FileDetailView => ({ path, diff, asking, sent }),
  }
}
