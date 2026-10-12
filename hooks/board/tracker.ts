import type { Host } from '../host'
import * as B from './board'

export type BoardView = {
  board: B.Board
  /** 직접 답하기 입력칸을 연 결정 id */
  answering: string | null
}

/** 기억할 거리 보드 상태, 결정에 답하면 사용자 요청으로 전송 */
export function createBoard(deps: {
  getHost: () => Host | null
  /** 결정 답을 보내기 직전, 변경 이유의 근거 요청으로 기록 */
  onSent: (text: string) => void
  /** 화면 갱신 요청 */
  onChange: () => void
}) {
  let board: B.Board = B.EMPTY_BOARD
  let answering: string | null = null

  function set(next: B.Board) {
    board = next
    if (answering !== null && !board.decisions.some(d => d.id === answering)) answering = null
    deps.onChange()
  }

  return {
    /** Claude 의 board 도구 호출 반영, 반영 뒤 보드 설명 반환 */
    apply(change: B.BoardUpdate): string {
      set(B.applyUpdate(board, change))
      return B.describeBoard(board)
    },

    /** 무언가를 만든 툴 결과의 링크 추가, 링크가 너무 많으면 만든 결과물이 아니라고 보고 무시 */
    captureLinks(text: string) {
      const pins = B.urlPins(text)
      if (pins.length > 0 && pins.length <= 3) set(B.addLinks(board, pins))
    },

    clearLinks() {
      set({ ...board, links: [] })
    },

    /** 직접 답하기 입력칸 열기, 같은 결정이면 닫기 */
    toggleAnswering(id: string) {
      answering = answering === id ? null : id
      deps.onChange()
    },

    /** 결정에 답을 사용자 요청으로 전송, Claude 가 닫을 때까지 답한 상태로 표시 */
    answer(id: string, value: string) {
      const host = deps.getHost()
      const decision = board.decisions.find(d => d.id === id)
      if (!host || !decision || !value.trim()) return
      const text = B.answerText(decision, value)
      deps.onSent(text)
      answering = null
      set(B.markAnswered(board, id, value.trim()))
      void host.submitPrompt(text).catch(() => undefined)
    },

    hasOpenDecision: () => board.decisions.length > 0,
    describe: () => B.describeBoard(board),

    clear() {
      board = B.EMPTY_BOARD
      answering = null
    },

    view: (): BoardView => ({ board, answering }),
  }
}
