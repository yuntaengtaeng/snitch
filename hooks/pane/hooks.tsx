import type { On } from 'claude-code'

import type { App } from '../app'
import * as C from '../config'
import { fileUrl } from '../paths'
import { historyText } from '../reasons/history'
import { countsOf, dashboardText, renderDashboard } from './dashboard'
import { renderFileDetail } from './detail'
import { closeOutcome, quickBarMode } from './navigation'
import { renderQuickBar } from './quick-bar'
import { isWideViewport } from './screens'

/** /snitch 명령, 패널 자동 열기, 입력창 위 아이콘 줄, 패널 닫기와 그리기 */
export function registerPaneHooks(on: On, app: App) {
  const { workFiles, reasons, fileDetail, board, pane, nav } = app

  /** /snitch, /changes 로 패널 열기와 닫기, text 는 텍스트 출력, why 는 변경 이유 다시 요약 */
  on('command.run', { command: [C.DASHBOARD_COMMAND, C.CHANGES_COMMAND] }, async ($, e, next) => {
    const host = app.getHost()
    if (!workFiles.view().repoRoot || !host) {
      return { text: '이 폴더는 git 저장소가 아니라서 작업 파일을 추적하지 않아요.' }
    }
    await workFiles.refresh()
    const arg = e.args.trim()

    if (arg.startsWith('why ')) {
      const query = arg.slice(4).trim()
      const path = app.findFile(query)
      if (path === null) return { text: `변경 파일에서 ${query} 찾지 못함` }
      return { text: historyText(path, reasons.view().history.get(path) ?? []) }
    }

    if (arg === 'why') {
      const paths = workFiles.view().current.map(f => f.path)
      if (paths.length === 0) return { text: '이유를 정리할 변경 파일 없음' }
      reasons.explainNow(paths)
      return { text: `변경 파일 ${paths.length}개의 이유 다시 정리 중` }
    }

    if (arg === 'text') {
      return { text: dashboardText(app.dashboard()) }
    }

    if (nav.view().isFolded) {
      nav.unfold('home')
      return {}
    }
    if ((await pane.toggle()) === 'opened') return {}
    if (pane.isDocked()) nav.fold()
    host.invalidate()
    return { text: '대시보드 패널 닫음' }
  }).catch(() => ({ text: '대시보드 불러오기 실패, 잠시 후 다시 시도' }))

  /** 넓은 창 여부 기록, 넓으면 세션당 한 번 패널 자동 열기 */
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    pane.sawViewport(isWideViewport(e.viewport, C.PANE_AUTO_OPEN_MIN_COLUMNS))
    pane.autoOpen()
    return next(e)
  })

  /** 접혔거나 좁은 창이면 입력창 위 오른쪽 끝에 아이콘 줄, 줄이 넓으면 화면 이름까지 */
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    const mode = quickBarMode({
      hasRepo: C.ENABLE.workFiles && workFiles.view().repoRoot !== null,
      hasSurvey: e.props.hasSurvey,
      isPaneOpen: pane.isOpen(),
      isFolded: nav.view().isFolded,
      isWide: isWideViewport(e.viewport, C.PANE_AUTO_OPEN_MIN_COLUMNS),
    })
    if (mode === 'none') return next(e)
    return renderQuickBar($.ui.resolve(e), countsOf(app.dashboard()), mode === 'folded' ? nav.unfold : app.openQuick, {
      withHome: mode === 'folded',
      withLabels: e.props.bodyColumns >= C.QUICK_LABEL_MIN_COLUMNS,
    })
  })

  /** 패널 닫기 처리, 파일 상세면 목록으로, 다른 화면이면 홈으로, 사이드바면 아이콘 줄로 접기 */
  on('ui.close', { id: C.PANE_ID }, ($, e, next) => {
    const outcome = closeOutcome(nav.view(), {
      isPerson: e.origin.kind === 'person',
      isDetailOpen: fileDetail.view().path !== null,
      isDocked: pane.isDocked(),
    })
    if (outcome === 'back-to-list') {
      app.backToList()
      return { value: undefined }
    }
    if (outcome === 'home') {
      nav.home()
      return { value: undefined }
    }
    fileDetail.close()
    pane.closed()
    if (outcome === 'fold') nav.fold()
    else if (nav.view().isQuick) nav.reset()
    app.getHost()?.invalidate()
    return next(e)
  })

  /** 대시보드 패널 그리기, 파일을 골랐으면 파일 상세 */
  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== C.PANE_ID) return next(e)
    const isDocked = e.props.placement === 'dock'
    pane.sawPlacement(isDocked)
    const width = Math.max(20, e.props.bodyColumns)
    const detail = fileDetail.view()
    const { path } = detail
    if (path === null) {
      return renderDashboard(
        $.ui.resolve(e),
        app.dashboard(),
        width,
        {
          openFile: app.openFile,
          answer: (id, value) => board.answer(id, value),
          toggleAnswering: app.toggleAnswering,
          clearLinks: () => board.clearLinks(),
          copyLink: (pin, surface) => board.copyLink(pin, surface),
          go: screen => nav.go(screen),
          fold: () => nav.fold(),
        },
        isDocked,
      )
    }

    const { repoRoot, current } = workFiles.view()
    return renderFileDetail(
      $.ui.resolve(e),
      { ...detail, path },
      reasons.view().history.get(path) ?? [],
      current.find(f => f.path === path),
      repoRoot && C.PANE_FILE_LINKS ? fileUrl(repoRoot, path) : undefined,
      width,
      { back: app.backToList, ask: app.askPart, send: (index, text) => fileDetail.send(index, text) },
    )
  })
}
