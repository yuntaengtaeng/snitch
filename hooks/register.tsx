import type { EngineInterface, On } from 'claude-code'

import { MAIN_ID } from './agents/roster'
import { createAgents } from './agents/tracker'
import * as C from './config'
import type { Host } from './host'
import { dashboardRows, dashboardText, renderDashboard, type DashboardView } from './pane/dashboard'
import { createReasons } from './reasons/tracker'
import { createStatusLine } from './status-line/tracker'
import { changedPaths } from './work-files/edits'
import { createWorkFiles } from './work-files/tracker'

/** session.start 의 $ 로 만든 Host, 엔진 규칙상 $ 를 받는 함수는 이 파일 안에 둠 */
function createHost($: EngineInterface): Host {
  return {
    run: argv => $.process.run(argv, { timeoutMs: 10_000 }),
    readFile: path => $.fs.read(path),
    storeGet: key => $.store.get(key),
    storeSet: (key, value) => $.store.set(key, value),
    storeDelete: key => $.store.delete(key),
    storeKeys: () => $.store.keys(),
    now: () => $.clock.now(),
    status: text => $.ui.status(text),
    toast: text => $.ui.toast(text),
    invalidate: () => $.ui.invalidate('ui.render'),
    openPane: rows =>
      $.ui.open({
        id: C.PANE_ID,
        title: C.PANE_TITLE,
        closeOnEscape: true,
        rows,
        columns: C.PANE_DOCK_COLUMNS,
      }),
    closePane: () => $.ui.close({ id: C.PANE_ID }),
    paneState: async () => {
      const pane = (await $.ui.panes()).find(p => p.id === C.PANE_ID)
      return {
        isOpen: pane !== undefined,
        isPlaced: pane?.isPlaced ?? false,
        isShown: pane?.isShown ?? false,
      }
    },
    every: (ms, fn) => $.clock.every(ms, fn),
    after: (ms, fn) => $.clock.after(ms, fn),
    complete: async (prompt, system) => {
      const r = await $.model.complete({
        model: C.REASON_MODEL,
        prompt,
        system,
        effort: 'low',
        timeoutMs: C.REASON_TIMEOUT_SEC * 1000,
      })
      return r.isAnswered ? r.text : null
    },
    listAgents: async () => (await $.agent.list()).map(a => ({ id: a.id, status: a.status })),
  }
}

/** snitch: Claude Code 이벤트를 상태줄, 작업 파일, 변경 이유, 에이전트, 대시보드 패널에 연결 */
export function register(on: On) {
  let host: Host | null = null
  let isPaneOpen = false
  let hasAutoOpened = false
  let timers: { cancel: () => void }[] = []

  const getHost = () => host
  const redraw = () => {
    if (isPaneOpen) host?.invalidate()
  }

  const workFiles = createWorkFiles({
    getHost,
    onChange: redraw,
    onCommitted: paths => reasons.forget(paths),
  })
  const reasons = createReasons({ getHost, changeOf: rel => workFiles.changeOf(rel), onChange: redraw })
  const agents = createAgents({ getHost, onChange: redraw })
  const statusLine = createStatusLine({ getHost, editedCount: workFiles.editedCount })

  const dashboard = (): DashboardView => ({
    agents: agents.view(),
    files: workFiles.view(),
    reasons: reasons.view(),
    limits: statusLine.limits(),
  })

  on('session.start', async ($, e, next) => {
    host = createHost($)
    const sid = await $.session.id().catch(() => '')
    isPaneOpen = false
    hasAutoOpened = false

    statusLine.start()
    reasons.clear()
    await agents.clear()
    await workFiles.start(e.cwd, sid)

    timers.forEach(t => t.cancel())
    timers = [
      host.every(C.CONFLICT_POLL_SEC * 1000, () => {
        if (isPaneOpen && workFiles.hasTracked()) void workFiles.refresh().catch(() => undefined)
      }),
      host.every(C.AGENT_TICK_SEC * 1000, () => {
        if (isPaneOpen) void agents.tick().catch(() => undefined)
      }),
    ]

    if (C.ENABLE.workFiles) {
      for (const name of [C.DASHBOARD_COMMAND, C.CHANGES_COMMAND]) {
        await $.command
          .register({
            name,
            description: '에이전트 현황과 변경 파일 대시보드, text 는 텍스트 출력, why 는 변경 이유 다시 요약',
            argumentHint: '[text|why]',
            immediate: true,
          })
          .catch(() => undefined)
      }
    }

    statusLine.update()
    return next(e)
  })

  /** /clear, /resume 시 작업량, 작업 파일, 변경 이유, 에이전트 초기화 */
  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const r = await next(e)
    await workFiles.clear()
    reasons.clear()
    await agents.clear()
    statusLine.clear()
    statusLine.update()
    redraw()
    return r
  })

  /** 메인 대화 요청의 모델과 effort 를 상태줄에 반영 */
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      statusLine.stepped(e.model, e.effort === undefined ? null : String(e.effort))
    }
    return yield* next(e)
  })

  on('turn.start', async ($, e, next) => {
    reasons.noteRequest(e.text)
    await agents.turnStarted()
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      await agents.spawned({ id: r.agentId, name: e.name ?? e.subagentType, task: e.description })
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    await agents.turnEnded(e.agentId, e.reason)
    if (e.agentId === undefined) reasons.turnEnded(e.answer)
    return r
  })

  on('session.measure', async ($, e, next) => {
    statusLine.measured(e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed })))
    redraw()
    return next(e)
  })

  /** 툴 호출마다 에이전트 활동 기록, 바뀐 파일 추적, Bash 명령 집계와 커밋 감지 */
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r

    const input = e as unknown as Record<string, unknown>
    agents.acted(e.agentId, e.tool, input)

    for (const path of changedPaths(e.tool, input, r.result, r.isError === true)) {
      const rel = workFiles.track(path, e.agentId ?? MAIN_ID)
      if (rel !== null) reasons.noteEdit(rel)
    }

    if (e.tool === 'Bash') {
      statusLine.commandRan()
      const command = typeof input['command'] === 'string' ? input['command'] : ''
      void workFiles.afterBash(command).catch(() => undefined)
    }
    statusLine.update()
    return r
  })

  /** /snitch, /changes 로 패널 열기와 닫기, text 는 텍스트 출력, why 는 변경 이유 다시 요약 */
  on('command.run', { command: [C.DASHBOARD_COMMAND, C.CHANGES_COMMAND] }, async ($, e, next) => {
    if (!workFiles.view().repoRoot || !host) {
      return { text: '이 폴더는 git 저장소가 아니라서 작업 파일을 추적하지 않아요.' }
    }
    await workFiles.refresh()
    const arg = e.args.trim()

    if (arg === 'why') {
      const paths = workFiles.view().current.map(f => f.path)
      if (paths.length === 0) return { text: '이유를 정리할 변경 파일 없음' }
      reasons.explainNow(paths)
      return { text: `변경 파일 ${paths.length}개의 이유 다시 정리 중` }
    }

    const isTooNarrowToDock =
      e.presentation.isFullscreen && e.presentation.columns < C.PANE_MIN_COLUMNS
    if (arg === 'text' || isTooNarrowToDock) {
      return { text: dashboardText(dashboard()) }
    }

    const pane = await host.paneState().catch(() => null)
    if (pane?.isOpen && pane.isPlaced && pane.isShown) {
      await host.closePane().catch(() => undefined)
      isPaneOpen = false
      return { text: '대시보드 패널 닫음' }
    }

    await host.openPane(dashboardRows(dashboard()))
    isPaneOpen = true
    return {}
  }).catch(() => ({ text: '대시보드 불러오기 실패, 잠시 후 다시 시도' }))

  /** 자동으로 연 패널을 화면 배치 뒤에 다시 그리고, 그래도 안 보이면 /snitch 안내 */
  function settleAutoOpenedPane() {
    host?.after(C.PANE_SETTLE_MS[0], redraw)
    host?.after(C.PANE_SETTLE_MS[1], () => {
      redraw()
      void host
        ?.paneState()
        .then(pane => {
          if (pane.isOpen && !(pane.isPlaced && pane.isShown)) host?.toast('대시보드 패널 배치 대기 중, /snitch 로 열기')
        })
        .catch(() => undefined)
    })
  }

  /** 전체화면 레이아웃이면 세션당 한 번 패널 자동 열기 */
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const canAutoOpen =
      C.ENABLE.workFiles && C.PANE_AUTO_OPEN && !hasAutoOpened && host !== null && workFiles.view().repoRoot !== null
    if (canAutoOpen && e.viewport?.isFullscreen === true) {
      hasAutoOpened = true
      isPaneOpen = true
      void host
        ?.openPane(dashboardRows(dashboard()))
        .then(() => settleAutoOpenedPane())
        .catch(() => {
          isPaneOpen = false
        })
    }
    return next(e)
  })

  on('ui.close', { id: C.PANE_ID }, ($, e, next) => {
    isPaneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== C.PANE_ID) return next(e)
    return renderDashboard($.ui.resolve(e), dashboard(), Math.max(20, e.props.bodyColumns))
  })
}
