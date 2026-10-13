import type { EngineInterface, On } from 'claude-code'

import type { App } from './app'
import { BOARD_TOOL_SPEC } from './board/tool'
import * as C from './config'
import type { Host } from './host'
import { isUserRequest } from './prompt-origin'
import { NOTE_TOOL_SPEC } from './reasons/note-tool'

/** session.start 의 $ 로 만든 Host */
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
    invalidate: () => $.ui.invalidate('ui.render'),
    openPane: (rows, focus) =>
      $.ui.open({
        id: C.PANE_ID,
        title: C.PANE_TITLE,
        closeOnEscape: true,
        rows,
        columns: C.PANE_DOCK_COLUMNS,
        ...(focus ? { focus } : {}),
      }),
    closePane: () => $.ui.close({ id: C.PANE_ID }),
    scrollPaneTop: async () => {
      await $.ui.scroll({ in: C.PANE_ID, to: 'start' })
    },
    focusPane: async key => {
      await $.ui.focus({ requestId: C.PANE_ID, key })
    },
    submitPrompt: async text => {
      await $.prompt.submit({ text, asUser: true })
    },
    copy: async (text, surface) => (await $.ui.copy({ text, surface })).isCopied,
    toast: text => $.ui.toast(text),
    paneState: async () => {
      const pane = (await $.ui.panes()).find(p => p.id === C.PANE_ID)
      return {
        isOpen: pane !== undefined,
        isPlaced: pane?.isPlaced ?? false,
        isShown: pane?.isShown ?? false,
      }
    },
    every: (ms, fn) => $.clock.every(ms, fn),
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

/** 세션 시작과 초기화, 요청과 턴의 흐름, 요금제 한도를 각 기능에 전달 */
export function registerSessionHooks(on: On, app: App) {
  const { workFiles, reasons, fileDetail, agents, statusLine, board, pane, nav } = app
  let timers: { cancel: () => void }[] = []

  on('session.start', async ($, e, next) => {
    const host = createHost($)
    app.attachHost(host)
    const sid = await $.session.id().catch(() => '')
    pane.reset()
    nav.reset()

    statusLine.start()
    reasons.clear()
    fileDetail.close()
    board.clear()
    await agents.clear()
    await workFiles.start(e.cwd, sid)
    /** 저장소 확인 뒤 아이콘 줄 다시 그리기 */
    host.invalidate()

    timers.forEach(t => t.cancel())
    timers = [
      host.every(C.CONFLICT_POLL_SEC * 1000, () => {
        if (pane.isOpen() && workFiles.hasTracked()) void workFiles.refresh().catch(() => undefined)
      }),
      host.every(C.AGENT_TICK_SEC * 1000, () => {
        if (pane.isOpen()) void agents.tick().catch(() => undefined)
      }),
    ]

    if (C.ENABLE.workFiles && C.ENABLE.changeNotes) {
      await $.tool.register(NOTE_TOOL_SPEC).catch(() => undefined)
    }
    if (C.ENABLE.board) {
      await $.tool.register(BOARD_TOOL_SPEC).catch(() => undefined)
    }

    if (C.ENABLE.workFiles) {
      for (const name of [C.DASHBOARD_COMMAND, C.CHANGES_COMMAND]) {
        await $.command
          .register({
            name,
            description: '에이전트 현황과 변경 파일 대시보드, text 는 텍스트 출력, why 는 변경 이유 다시 요약, why 파일은 그 파일의 이유 이력',
            argumentHint: '[text|why [파일]]',
            immediate: true,
          })
          .catch(() => undefined)
      }
    }

    statusLine.update()
    return next(e)
  })

  /** /clear, /resume 시 작업 파일, 변경 이유, 에이전트 초기화 */
  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const r = await next(e)
    await workFiles.clear()
    reasons.clear()
    fileDetail.close()
    board.clear()
    await agents.clear()
    app.redraw()
    statusLine.update()
    return r
  })

  /** 메인 대화 요청의 모델과 effort 를 상태줄에 반영 */
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      statusLine.stepped(e.model, e.effort === undefined ? null : String(e.effort))
    }
    return yield* next(e)
  })

  /** 사용자가 직접 보낸 요청이면 변경 이유의 근거로 기록, 아이콘 줄로 잠깐 연 패널은 닫기 */
  on('prompt.submit', async ($, e, next) => {
    if (isUserRequest(e.origin.kind)) {
      app.noteUserRequest(e.text)
      if (nav.view().isQuick) app.closeQuick()
    }
    return next(e)
  })

  /** 메인 대화 턴 시작, 새 요청이면 끝난 서브에이전트 정리, 사용자가 직접 커밋한 파일 반영 */
  on('turn.start', async ($, e, next) => {
    if (workFiles.hasTracked()) void workFiles.refresh().catch(() => undefined)
    await agents.turnStarted(app.takeUserRequest())
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
    statusLine.measured(e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })))
    app.redraw()
    return next(e)
  })
}
