import type { EngineInterface, On } from 'claude-code'

import { MAIN_ID } from './agents/roster'
import { createAgents } from './agents/tracker'
import { asksUser, makesSomething, parseUpdate, updateSummary } from './board/board'
import { BOARD_PROMPT, BOARD_TOOL_SPEC, NUDGE } from './board/tool'
import { createBoard } from './board/tracker'
import { boardStatusParts, isBoardEmpty } from './board/view'
import * as C from './config'
import { createFileDetail } from './file-detail/tracker'
import type { Host } from './host'
import { dashboardRows, dashboardText, renderDashboard, type DashboardView } from './pane/dashboard'
import { answerKey } from './pane/board-section'
import { createPaneController } from './pane/controller'
import { askKey, renderFileDetail } from './pane/detail'
import { fileUrl } from './paths'
import { isUserRequest } from './prompt-origin'
import { historyText } from './reasons/history'
import { NOTE_PROMPT, NOTE_TOOL_SPEC, parseNotes } from './reasons/note-tool'
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
    invalidate: () => $.ui.invalidate('ui.render'),
    openPane: rows =>
      $.ui.open({ id: C.PANE_ID, title: C.PANE_TITLE, closeOnEscape: true, rows, columns: C.PANE_DOCK_COLUMNS }),
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

/** snitch: Claude Code 이벤트를 상태줄, 작업 파일, 변경 이유, 에이전트, 대시보드 패널에 연결 */
export function register(on: On) {
  let host: Host | null = null
  /** 다음 턴이 사용자가 직접 보낸 요청으로 시작하는지 여부 */
  let isNextTurnUserRequest = false
  let timers: { cancel: () => void }[] = []

  const getHost = () => host
  const pane = createPaneController({
    getHost,
    rows: () => dashboardRows(dashboard()),
    allowsAutoOpen: () => C.ENABLE.workFiles && C.PANE_AUTO_OPEN && workFiles.view().repoRoot !== null,
  })
  const redraw = () => pane.redraw()

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
    onSent: text => {
      reasons.noteRequest(text)
      isNextTurnUserRequest = true
    },
    onChange: redraw,
  })
  const agents = createAgents({ getHost, onChange: redraw })
  const statusLine = createStatusLine({
    getHost,
    boardParts: () => (C.ENABLE.board ? boardStatusParts(board.view().board) : []),
  })

  /** 이름이나 경로 끝부분으로 찾은 변경 파일의 레포 기준 경로 */
  const findFile = (query: string): string | null => {
    const paths = [...new Set([...workFiles.view().current.map(f => f.path), ...reasons.view().history.keys()])]
    return paths.find(p => p === query) ?? paths.find(p => p.endsWith(`/${query}`)) ?? null
  }

  const board = createBoard({
    getHost,
    onSent: text => {
      reasons.noteRequest(text)
      isNextTurnUserRequest = true
    },
    /** 상태줄은 패널이 닫혀 있어도 보이므로 항상 갱신 */
    onChange: () => {
      redraw()
      statusLine.update()
    },
  })

  const dashboard = (): DashboardView => ({
    agents: agents.view(),
    board: board.view(),
    files: workFiles.view(),
    reasons: reasons.view(),
    limits: statusLine.limits(),
  })

  /** 패널을 파일 상세 화면으로 전환 */
  const openFile = (path: string) => {
    fileDetail.open(path)
    pane.show(C.PANE_MAX_ROWS)
  }

  /** 파일 상세 화면에서 목록으로 복귀 */
  const backToList = () => {
    fileDetail.close()
    redraw()
    pane.show()
  }

  /** 수정 요청 입력칸을 열고 포커스 이동 */
  const askPart = (index: number) => {
    fileDetail.ask(index)
    if (fileDetail.view().asking === index) pane.focus(askKey(index))
  }

  /** 결정의 직접 답하기 입력칸을 열고 포커스 이동 */
  const toggleAnswering = (id: string) => {
    board.toggleAnswering(id)
    if (board.view().answering === id) pane.focus(answerKey(id))
  }

  /** 빈 보드에 첫 항목이 생기면 패널 열기 */
  const openIfFirstPin = (wasEmpty: boolean) => {
    if (wasEmpty && !isBoardEmpty(board.view().board)) pane.openUnasked()
  }

  on('session.start', async ($, e, next) => {
    host = createHost($)
    const sid = await $.session.id().catch(() => '')
    pane.reset()

    statusLine.start()
    reasons.clear()
    fileDetail.close()
    board.clear()
    await agents.clear()
    await workFiles.start(e.cwd, sid)

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
    redraw()
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

  /** 사용자가 직접 보낸 요청이면 변경 이유의 근거로 기록하고 다음 턴을 새 요청으로 표시 */
  on('prompt.submit', async ($, e, next) => {
    if (isUserRequest(e.origin.kind)) {
      reasons.noteRequest(e.text)
      isNextTurnUserRequest = true
    }
    return next(e)
  })

  /** 메인 대화 턴 시작, 새 요청이면 끝난 서브에이전트 정리, 사용자가 직접 커밋한 파일 반영 */
  on('turn.start', async ($, e, next) => {
    if (workFiles.hasTracked()) void workFiles.refresh().catch(() => undefined)
    await agents.turnStarted(isNextTurnUserRequest)
    isNextTurnUserRequest = false
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

  /** 변경 메모 안내와 지금 보드를 시스템 프롬프트 끝에 추가, 도구가 제공될 때만 */
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const sections = [...r.sections]
    if (e.tools.includes(C.NOTE_TOOL_ID)) {
      sections.push({ id: 'snitch:change-note', text: NOTE_PROMPT, scope: 'session' as const })
    }
    if (e.tools.includes(C.BOARD_TOOL_ID)) {
      sections.push({ id: 'snitch:board', text: `${BOARD_PROMPT}\n${board.describe()}`, scope: 'session' as const })
    }
    return { sections }
  })

  /** 보드 도구 호출 반영, 서브에이전트는 거부 */
  on('tool.call', { tool: C.BOARD_TOOL_ID }, async ($, e, next) => {
    if (e.agentId) return { deny: '보드는 메인 대화만 고칠 수 있음' }
    const wasEmpty = isBoardEmpty(board.view().board)
    const result = board.apply(parseUpdate(e as unknown as Record<string, unknown>))
    openIfFirstPin(wasEmpty)
    return { result }
  })

  /** 질문으로 끝난 응답인데 열린 결정이 없으면 한 번 돌려보내 결정으로 남기게 함 */
  on('classic.Stop', async ($, e, next) => {
    const ran = await next(e)
    if (!C.ENABLE.board || ran.block || e.stop_hook_active) return ran
    if (!asksUser(e.last_assistant_message ?? '') || board.hasOpenDecision()) return ran
    return { ...ran, block: NUDGE }
  })

  /** 보드 도구 호출은 대화창에 흐린 한 줄로만 표시 */
  on('ui.render', { component: 'ToolUse', props: { tool: C.BOARD_TOOL_ID } }, async ($, e) => {
    const { Text } = $.ui.resolve(e)
    const change = parseUpdate((e.props.input ?? {}) as Record<string, unknown>)
    return <Text dimColor>{updateSummary(change)}</Text>
  })

  on('ui.render', { component: 'ToolResult', props: { tool: C.BOARD_TOOL_ID } }, async ($, e, next) =>
    e.props.isErrored ? next(e) : $.ui.resolve(e).Text({ children: [''] }),
  )

  /** 변경 메모 도구 호출에 응답하고 메모를 변경 이유로 반영 */
  on('tool.call', { tool: C.NOTE_TOOL_ID }, async ($, e, next) => {
    const notes = parseNotes(e as unknown as Record<string, unknown>).flatMap(n => {
      const rel = workFiles.repoPathOf(n.path)
      return rel === null ? [] : [{ rel, reason: n.reason }]
    })
    const count = reasons.noted(notes)
    return { result: count > 0 ? `변경 메모 ${count}개 기록` : '기록할 변경 메모 없음, 레포 안 파일 경로와 이유 확인 필요' }
  })

  on('session.measure', async ($, e, next) => {
    statusLine.measured(e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed, resetsAt: r.resetsAt })))
    redraw()
    return next(e)
  })

  /** 툴 호출마다 에이전트 활동 기록, 바뀐 파일 추적, Bash 뒤 커밋 감지 */
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r

    const input = e as unknown as Record<string, unknown>
    if (e.tool !== C.NOTE_TOOL_ID && e.tool !== C.BOARD_TOOL_ID) agents.acted(e.agentId, e.tool, input)

    const madeText = 'text' in r && r.isError !== true ? r.text : undefined
    if (C.ENABLE.board && !e.agentId && madeText && makesSomething(e.tool, input)) {
      const wasEmpty = isBoardEmpty(board.view().board)
      board.captureLinks(madeText)
      openIfFirstPin(wasEmpty)
    }

    for (const path of changedPaths(e.tool, input, r.result, r.isError === true)) {
      const rel = workFiles.track(path, e.agentId ?? MAIN_ID)
      if (rel !== null) reasons.noteEdit(rel)
    }

    if (e.tool === 'Bash') {
      const command = typeof input['command'] === 'string' ? input['command'] : ''
      void workFiles.afterBash(command).catch(() => undefined)
    }
    return r
  })

  /** /snitch, /changes 로 패널 열기와 닫기, text 는 텍스트 출력, why 는 변경 이유 다시 요약 */
  on('command.run', { command: [C.DASHBOARD_COMMAND, C.CHANGES_COMMAND] }, async ($, e, next) => {
    if (!workFiles.view().repoRoot || !host) {
      return { text: '이 폴더는 git 저장소가 아니라서 작업 파일을 추적하지 않아요.' }
    }
    await workFiles.refresh()
    const arg = e.args.trim()

    if (arg.startsWith('why ')) {
      const path = findFile(arg.slice(4).trim())
      if (path === null) return { text: `변경 파일에서 ${arg.slice(4).trim()} 찾지 못함` }
      return { text: historyText(path, reasons.view().history.get(path) ?? []) }
    }

    if (arg === 'why') {
      const paths = workFiles.view().current.map(f => f.path)
      if (paths.length === 0) return { text: '이유를 정리할 변경 파일 없음' }
      reasons.explainNow(paths)
      return { text: `변경 파일 ${paths.length}개의 이유 다시 정리 중` }
    }

    if (arg === 'text') {
      return { text: dashboardText(dashboard()) }
    }

    return (await pane.toggle()) === 'closed' ? { text: '대시보드 패널 닫음' } : {}
  }).catch(() => ({ text: '대시보드 불러오기 실패, 잠시 후 다시 시도' }))

  /** 전체화면 레이아웃이면 세션당 한 번 패널 자동 열기 */
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    pane.autoOpen(e.viewport?.isFullscreen === true)
    return next(e)
  })

  /** 상세 화면에서 Esc 는 목록으로 복귀, 그 외 닫기는 패널 닫음 */
  on('ui.close', { id: C.PANE_ID }, ($, e, next) => {
    if (e.origin.kind === 'person' && fileDetail.view().path !== null) {
      backToList()
      return { value: undefined }
    }
    fileDetail.close()
    pane.closed()
    return next(e)
  })

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== C.PANE_ID) return next(e)
    const width = Math.max(20, e.props.bodyColumns)
    const detail = fileDetail.view()
    const { path } = detail
    if (path === null) {
      return renderDashboard($.ui.resolve(e), dashboard(), width, {
        openFile,
        answer: (id, value) => board.answer(id, value),
        toggleAnswering,
        clearLinks: () => board.clearLinks(),
        copyLink: (pin, surface) => board.copyLink(pin, surface),
      })
    }

    const { repoRoot, current } = workFiles.view()
    return renderFileDetail(
      $.ui.resolve(e),
      { ...detail, path },
      reasons.view().history.get(path) ?? [],
      current.find(f => f.path === path),
      repoRoot && C.PANE_FILE_LINKS ? fileUrl(repoRoot, path) : undefined,
      width,
      { back: backToList, ask: askPart, send: (index, text) => fileDetail.send(index, text) },
    )
  })
}
