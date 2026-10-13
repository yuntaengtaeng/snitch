import { createAgents } from './agents/tracker'
import { createBoard } from './board/tracker'
import { boardStatusParts, isBoardEmpty } from './board/view'
import * as C from './config'
import { createFileDetail } from './file-detail/tracker'
import type { Host } from './host'
import { answerKey } from './pane/board-section'
import { createPaneController } from './pane/controller'
import { dashboardRows, type DashboardView } from './pane/dashboard'
import { askKey } from './pane/detail'
import { createNavigation, type Screen } from './pane/navigation'
import { createReasons } from './reasons/tracker'
import { createStatusLine } from './status-line/tracker'
import { createWorkFiles } from './work-files/tracker'

export type App = ReturnType<typeof createApp>

/** 기능별 상태를 서로 연결해 만든 snitch 한 벌, 훅 등록 모듈들이 함께 씀 */
export function createApp() {
  let host: Host | null = null
  /** 다음 턴이 사용자가 직접 보낸 요청으로 시작하는지 여부 */
  let isNextTurnUserRequest = false

  const getHost = () => host

  /** 사용자 요청으로 보낸 글을 변경 이유의 근거로 남기고 다음 턴을 새 요청으로 표시 */
  const noteUserRequest = (text: string) => {
    reasons.noteRequest(text)
    isNextTurnUserRequest = true
  }

  const pane = createPaneController({
    getHost,
    rows: () => dashboardRows(dashboard()),
    allowsAutoOpen: () => C.ENABLE.workFiles && C.PANE_AUTO_OPEN && workFiles.view().repoRoot !== null,
  })

  /** 패널이 열렸거나 아이콘 줄이 보이면 다시 그리기 */
  const redraw = () => {
    if (pane.isOpen() || !pane.isWide() || nav.view().isFolded) host?.invalidate()
  }

  const workFiles = createWorkFiles({
    getHost,
    onChange: () => {
      fileDetail.refresh()
      redraw()
    },
    onCleaned: paths => reasons.forget(paths),
  })
  const reasons = createReasons({
    getHost,
    changeSince: (rel, blob) => workFiles.changeSince(rel, blob),
    snapshot: rel => workFiles.snapshot(rel),
    onChange: redraw,
  })
  const fileDetail = createFileDetail({
    getHost,
    changeOf: rel => workFiles.changeOf(rel),
    onSent: noteUserRequest,
    onChange: redraw,
  })
  const agents = createAgents({ getHost, onChange: redraw })
  const statusLine = createStatusLine({
    getHost,
    boardParts: () => (C.ENABLE.board ? boardStatusParts(board.view().board) : []),
  })
  const board = createBoard({
    getHost,
    onSent: noteUserRequest,
    /** 패널과 함께 상태줄 갱신 */
    onChange: () => {
      redraw()
      statusLine.update()
    },
  })

  /** 접으면 패널을 닫고 아이콘 줄로, 펼치면 다시 열기, 화면만 옮기면 새 높이로 다시 열고 맨 위로 */
  const nav = createNavigation({
    onChange: (next, prev) => {
      if (next.isFolded && !prev.isFolded) {
        if (pane.isOpen()) pane.close()
        host?.invalidate()
      } else if (!next.isFolded && prev.isFolded) {
        pane.openFocused()
        host?.invalidate()
      } else if (pane.isOpen()) {
        redraw()
        pane.show()
      }
    },
  })

  const dashboard = (): DashboardView => ({
    agents: agents.view(),
    board: board.view(),
    files: workFiles.view(),
    reasons: reasons.view(),
    limits: statusLine.limits(),
    nav: nav.view(),
  })

  return {
    workFiles,
    reasons,
    fileDetail,
    agents,
    statusLine,
    board,
    pane,
    nav,
    dashboard,
    redraw,
    getHost,
    noteUserRequest,

    /** session.start 에서 만든 Host 연결 */
    attachHost(next: Host) {
      host = next
    },

    /** 이번 턴이 사용자가 직접 보낸 요청으로 시작했는지 꺼내고 표시 지우기 */
    takeUserRequest(): boolean {
      const was = isNextTurnUserRequest
      isNextTurnUserRequest = false
      return was
    },

    /** 이름이나 경로 끝부분으로 찾은 변경 파일의 레포 기준 경로 */
    findFile(query: string): string | null {
      const paths = [...new Set([...workFiles.view().current.map(f => f.path), ...reasons.view().history.keys()])]
      return paths.find(p => p === query) ?? paths.find(p => p.endsWith(`/${query}`)) ?? null
    },

    /** 패널을 파일 상세 화면으로 전환 */
    openFile(path: string) {
      fileDetail.open(path)
      pane.show(C.PANE_MAX_ROWS)
    },

    /** 파일 상세 화면에서 목록으로 복귀 */
    backToList() {
      fileDetail.close()
      redraw()
      pane.show()
    },

    /** 좁은 창의 아이콘 줄에서 그 화면만 잠깐 열기 */
    openQuick(screen: Screen) {
      fileDetail.close()
      nav.quick(screen)
      pane.openFocused()
      host?.invalidate()
    },

    /** 잠깐 연 화면을 닫고 아이콘 줄로 복귀 */
    closeQuick() {
      fileDetail.close()
      nav.reset()
      pane.close()
      host?.invalidate()
    },

    /** 수정 요청 입력칸을 열고 포커스 이동 */
    askPart(index: number) {
      fileDetail.ask(index)
      if (fileDetail.view().asking === index) pane.focus(askKey(index))
    },

    /** 결정의 직접 답하기 입력칸을 열고 포커스 이동 */
    toggleAnswering(id: string) {
      board.toggleAnswering(id)
      if (board.view().answering === id) pane.focus(answerKey(id))
    },

    /** 빈 보드에 첫 항목이 생기면 패널 열기 */
    openIfFirstPin(wasEmpty: boolean) {
      if (wasEmpty && !isBoardEmpty(board.view().board)) pane.openUnasked()
    },
  }
}
