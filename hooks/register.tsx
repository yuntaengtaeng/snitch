import type { On, RenderChildren } from 'claude-code'

import * as C from './config'
import * as L from './logic'

/**
 * snitch: 상태줄과 작업 파일 패널(/changes)
 */

/** hook 밖에서 이어지는 비동기 작업이 쓰는 $ 함수 */
type Host = {
  run: (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  readFile: (path: string) => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeDelete: (key: string) => Promise<void>
  storeKeys: () => Promise<string[]>
  now: () => Promise<number>
  sessionId: () => Promise<string>
  status: (text: string | undefined) => void
  invalidate: () => void
  openPane: (rows: number) => Promise<unknown>
  closePane: () => Promise<void>
  paneState: () => Promise<{ isOpen: boolean; isPlaced: boolean; isShown: boolean }>
  every: (ms: number, fn: () => void) => { cancel: () => void }
}

export function register(on: On) {
  let host: Host | null = null
  let cwd = ''
  let isWindows = false

  /** 메인 대화가 마지막으로 보낸 요청의 모델 · effort */
  let model: string | null = null
  let effort: string | null = null

  let rateLimits: L.RateLimit[] = []
  let todayUsd: number | null = null
  let costDay = ''
  /** 자정을 넘긴 시점의 세션 누적 비용 */
  let costDayBaseUsd = 0
  let lastSessionUsd = 0
  let hasPrunedCosts = false
  const editedAll = new Set<string>()
  let commands = 0

  let repoRoot: string | null = null
  let head: string | null = null
  /** 마지막 커밋 이후 Claude가 편집한 파일 (레포 기준 경로, 편집 순서) */
  const tracked: string[] = []
  let commits: L.CommitEntry[] = []
  let current: L.FileStat[] = []
  let isPaneOpen = false
  let isRefreshing = false
  let isRefreshQueued = false
  let hasAutoOpened = false
  let sid = ''
  let poller: { cancel: () => void } | null = null

  function resetSession() {
    editedAll.clear()
    commands = 0
    tracked.length = 0
    commits = []
    current = []
  }

  function updateStatus() {
    if (!host || !C.ENABLE.statusLine) return
    const showModel = C.ENABLE.modelEffort
    host.status(
      L.statusText({
        model: showModel ? model : null,
        effort: showModel ? effort : null,
        rateLimits,
        todayUsd,
        editedFiles: editedAll.size,
        commands,
      }),
    )
  }

  function absolute(path: string): string {
    if (L.isAbsolutePath(path)) return L.normalizePath(path, isWindows)
    return L.normalizePath(`${L.normalizePath(cwd, isWindows)}/${path}`, isWindows)
  }

  /** 편집 툴 입력의 대상 파일 절대 경로 */
  function editedPathOf(input: Record<string, unknown>): string | null {
    const p = input['file_path'] ?? input['notebook_path']
    return typeof p === 'string' && p.length > 0 ? absolute(p) : null
  }

  async function git(args: string[]) {
    if (!host) return null
    return host
      .run(['git', '-c', 'core.quotePath=false', ...args])
      .catch(() => null)
  }

  async function readHead(): Promise<string | null> {
    const r = await git(['rev-parse', '--short', 'HEAD'])
    return r && r.exitCode === 0 ? r.stdout.trim() : null
  }

  async function countLines(rel: string): Promise<number | null> {
    if (!host || !repoRoot) return null
    const text = await host.readFile(`${repoRoot}/${rel}`).catch(() => null)
    if (text === null) return null
    if (text.length === 0) return 0
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  }

  /** tracked 파일의 HEAD 대비 변경량. 변경이 없는 파일은 제외 */
  async function computeCurrent(): Promise<L.FileStat[]> {
    if (!repoRoot || tracked.length === 0) return []

    const paths = [...tracked]
    const diff = await git(['diff', '--numstat', '--no-renames', 'HEAD', '--', ...paths])
    const byPath = new Map<string, L.FileStat>()
    if (diff && diff.exitCode === 0) {
      for (const s of L.parseNumstat(diff.stdout)) byPath.set(s.path, s)
    }

    const others = await git(['ls-files', '--others', '--exclude-standard', '--', ...paths])
    if (others && others.exitCode === 0) {
      for (const rel of others.stdout.split('\n').filter(Boolean)) {
        byPath.set(rel, { path: rel, added: await countLines(rel), deleted: 0, isNew: true })
      }
    }

    const elsewhere = await otherSessions()

    return paths.flatMap(p => {
      const s = byPath.get(p)
      if (!s) return []
      const n = elsewhere.get(isWindows ? p.toLowerCase() : p) ?? 0
      return [n > 0 ? { ...s, otherSessions: n } : s]
    })
  }

  async function recordMyEdit(rel: string) {
    if (!host || !repoRoot || !sid) return
    await host.storeSet(L.editKey(repoRoot, rel, sid, isWindows), await host.now())
  }

  async function forgetMyEdits(rels: string[]) {
    if (!host || !repoRoot || !sid) return
    for (const rel of rels) {
      await host.storeDelete(L.editKey(repoRoot, rel, sid, isWindows)).catch(() => undefined)
    }
  }

  /** 다른 세션이 최근 수정한 파일별 세션 수. 만료된 기록은 삭제 */
  async function otherSessions(): Promise<Map<string, number>> {
    if (!host || !repoRoot || !sid) return new Map()
    const now = await host.now()
    const ttl = C.CONFLICT_TTL_MIN * 60_000
    const entries: { key: string; at: number }[] = []
    for (const key of await host.storeKeys()) {
      if (!key.startsWith('edit:')) continue
      const at = await host.storeGet(key)
      if (typeof at !== 'number') continue
      if (now - at > ttl * 2) {
        await host.storeDelete(key).catch(() => undefined)
        continue
      }
      entries.push({ key, at })
    }
    return L.otherSessionsByFile(entries, repoRoot, sid, now, ttl, isWindows)
  }

  /** current 를 다시 계산하고 패널을 다시 그림. 실행 중 요청은 한 번으로 합침 */
  async function refresh() {
    if (!C.ENABLE.workFiles || !repoRoot) return
    if (isRefreshing) {
      isRefreshQueued = true
      return
    }
    isRefreshing = true
    try {
      do {
        isRefreshQueued = false
        current = await computeCurrent()
      } while (isRefreshQueued)
    } finally {
      isRefreshing = false
    }
    if (isPaneOpen) host?.invalidate()
  }

  /** HEAD 가 바뀌었으면 새 커밋을 commits 에 추가하고, 커밋된 파일을 tracked 에서 제거 */
  async function recordCommitIfAny() {
    const next = await readHead()
    if (next === null || next === head) {
      await refresh()
      return
    }
    head = next

    const header = await git(['log', '-1', '--format=%h%x00%s'])
    const parsed = header && header.exitCode === 0 ? L.parseCommitHeader(header.stdout) : null
    const show = await git(['show', '--numstat', '--no-renames', '--format=', 'HEAD'])
    const files = show && show.exitCode === 0 ? L.parseNumstat(show.stdout) : []

    commits = [
      ...commits,
      { hash: parsed?.hash ?? next, subject: parsed?.subject ?? '', files },
    ]

    const committed = new Set(files.map(f => f.path))
    await forgetMyEdits(tracked.filter(p => committed.has(p)))
    const remaining = tracked.filter(p => !committed.has(p))
    tracked.length = 0
    tracked.push(...remaining)

    await refresh()
  }

  /** 이 세션의 오늘 비용을 저장하고, 모든 세션의 오늘 합계를 todayUsd 에 반영 */
  async function recordCost(sessionUsd: number) {
    if (!host) return
    const day = L.dayKey(await host.now())

    if (costDay === '') {
      costDay = day
    } else if (day !== costDay) {
      costDayBaseUsd = lastSessionUsd
      costDay = day
    }
    lastSessionUsd = sessionUsd

    const sessionId = await host.sessionId()
    await host.storeSet(`cost:${day}:${sessionId}`, Math.max(0, sessionUsd - costDayBaseUsd))

    const keys = await host.storeKeys()
    let sum = 0
    for (const key of keys) {
      if (L.dayOfCostKey(key) !== day) continue
      const v = await host.storeGet(key)
      if (typeof v === 'number') sum += v
    }
    todayUsd = sum

    if (!hasPrunedCosts) {
      hasPrunedCosts = true
      const oldest = L.dayKey((await host.now()) - C.COST_KEEP_DAYS * 86_400_000)
      for (const key of keys) {
        const d = L.dayOfCostKey(key)
        if (d !== null && d < oldest) await host.storeDelete(key).catch(() => undefined)
      }
    }
  }

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    isWindows = L.isWindowsPath(e.cwd)
    model = null
    effort = null
    const h: Host = {
      run: argv => $.process.run(argv, { timeoutMs: 10_000 }),
      readFile: path => $.fs.read(path),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      storeDelete: key => $.store.delete(key),
      storeKeys: () => $.store.keys(),
      now: () => $.clock.now(),
      sessionId: () => $.session.id(),
      status: text => $.ui.status(text),
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
      every: (ms, fn) => $.clock.every(ms, fn),
      paneState: async () => {
        const pane = (await $.ui.panes()).find(p => p.id === C.PANE_ID)
        return {
          isOpen: pane !== undefined,
          isPlaced: pane?.isPlaced ?? false,
          isShown: pane?.isShown ?? false,
        }
      },
    }
    host = h

    resetSession()
    hasAutoOpened = false
    isPaneOpen = false
    sid = await $.session.id().catch(() => '')

    poller?.cancel()
    poller = h.every(C.CONFLICT_POLL_SEC * 1000, () => {
      if (isPaneOpen && tracked.length > 0) void refresh().catch(() => undefined)
    })

    if (C.ENABLE.workFiles) {
      const top = await git(['rev-parse', '--show-toplevel'])
      repoRoot = top && top.exitCode === 0 ? L.normalizePath(top.stdout.trim(), isWindows) : null
      head = await readHead()
      await $.command
        .register({
          name: C.CHANGES_COMMAND,
          description: '이 세션에서 Claude가 편집한 파일 패널 (커밋별로 쌓임)',
          argumentHint: '[text]',
          immediate: true,
        })
        .catch(() => undefined)
    }

    updateStatus()
    return next(e)
  })

  /** /clear, /resume: 작업량과 작업 파일 초기화 */
  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const r = await next(e)
    await forgetMyEdits([...tracked])
    resetSession()
    head = await readHead()
    updateStatus()
    if (isPaneOpen) host?.invalidate()
    return r
  })

  /** 메인 대화 요청의 모델 · effort 를 상태줄에 반영 */
  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && C.ENABLE.statusLine && C.ENABLE.modelEffort) {
      const nextEffort = e.effort === undefined ? null : String(e.effort)
      if (e.model !== model || nextEffort !== effort) {
        model = e.model
        effort = nextEffort
        updateStatus()
      }
    }
    return yield* next(e)
  })

  /** 요금제 한도와 비용을 상태줄에 반영 */
  on('session.measure', async ($, e, next) => {
    if (C.ENABLE.statusLine) {
      rateLimits = e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed }))
      if (e.cost) await recordCost(e.cost.usd).catch(() => undefined)
      updateStatus()
    }
    return next(e)
  })

  /** 편집 툴: 작업 파일 추가. Bash: 명령 수 증가, git commit 이면 커밋 기록 */
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r

    const input = e as unknown as Record<string, unknown>
    const isError = r.isError === true
    const isEdit = (C.EDIT_TOOLS as readonly string[]).includes(e.tool)

    if (isEdit && !isError) {
      const abs = editedPathOf(input)
      if (abs) {
        editedAll.add(abs)
        const rel = repoRoot ? L.relativeTo(repoRoot, abs, isWindows) : null
        if (rel !== null) {
          if (!tracked.includes(rel)) tracked.push(rel)
          void recordMyEdit(rel)
            .then(() => refresh())
            .catch(() => undefined)
        }
      }
    } else if (e.tool === 'Bash') {
      commands += 1
      const command = typeof input['command'] === 'string' ? input['command'] : ''
      if (C.ENABLE.workFiles && L.mentionsGitCommit(command)) {
        void recordCommitIfAny().catch(() => undefined)
      } else if (tracked.length > 0) {
        void refresh().catch(() => undefined)
      }
    }
    updateStatus()
    return r
  })

  /**
   * /changes: 패널 열기 / 닫기.
   * "/changes text" 이거나 전체화면에서 PANE_MIN_COLUMNS 보다 좁으면 텍스트로 출력
   */
  on('command.run', { command: C.CHANGES_COMMAND }, async ($, e, next) => {
    if (!repoRoot || !host) {
      return { text: '이 폴더는 git 저장소가 아니라서 작업 파일을 추적하지 않아요.' }
    }
    await refresh()

    const isTooNarrowToDock =
      e.presentation.isFullscreen && e.presentation.columns < C.PANE_MIN_COLUMNS
    if (e.args.trim() === 'text' || isTooNarrowToDock) {
      return { text: L.panelText(commits, current) }
    }

    const pane = await host.paneState().catch(() => null)
    if (pane?.isOpen && pane.isPlaced && pane.isShown) {
      await host.closePane().catch(() => undefined)
      isPaneOpen = false
      return { text: '작업 파일 패널을 닫았어요.' }
    }

    await host.openPane(Math.min(L.panelRows(commits, current), 24))
    isPaneOpen = true
    return {}
  })

  /** 전체화면 레이아웃이면 세션당 한 번 패널 자동 열기 */
  on('ui.render', { component: 'PromptHint' }, ($, e, next) => {
    const canAutoOpen =
      C.ENABLE.workFiles && C.PANE_AUTO_OPEN && !hasAutoOpened && host !== null && repoRoot !== null
    if (canAutoOpen && e.viewport?.isFullscreen === true) {
      hasAutoOpened = true
      isPaneOpen = true
      void host?.openPane(20).catch(() => {
        isPaneOpen = false
      })
    }
    return next(e)
  })

  on('ui.close', { id: C.PANE_ID }, ($, e, next) => {
    isPaneOpen = false
    return next(e)
  })

  /** 작업 파일 패널 */
  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== C.PANE_ID) return next(e)

    const { Box, Text, Link } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)
    const all = L.totalsOf(current)

    /** +추가 −삭제. 0 이거나 dim 이면 흐리게 */
    const stat = (f: { added: number | null; deleted: number | null }, dim = false) =>
      f.added === null || f.deleted === null ? (
        <Text color="inactive">bin</Text>
      ) : (
        <Text>
          <Text color={dim || f.added === 0 ? 'inactive' : 'diffAddedWord'}>{`+${f.added}`}</Text>
          <Text> </Text>
          <Text color={dim || f.deleted === 0 ? 'inactive' : 'diffRemovedWord'}>{`−${f.deleted}`}</Text>
        </Text>
      )

    /** 왼쪽은 남는 너비를 채우고 오른쪽은 끝에 붙는 한 줄 */
    const row = (key: string, left: RenderChildren, right: RenderChildren) => (
      <Box key={key} flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          {left}
        </Box>
        <Box flexShrink={0} marginLeft={1}>
          {right}
        </Box>
      </Box>
    )

    const label = (key: string, text: string) => (
      <Box key={key} marginTop={1}>
        <Text color="inactive" bold>
          {text}
        </Text>
      </Box>
    )

    const commitRows = commits.map(c =>
      row(
        `c-${c.hash}`,
        <Text color="inactive" wrap="truncate-end">{`● ${c.hash} ${c.subject}`}</Text>,
        stat(L.totalsOf(c.files), true),
      ),
    )

    const fileRows = current.map(f => {
      const { name, dir } = L.splitPath(f.path)
      const letter = L.statusLetter(f)
      return (
        <Box key={`f-${f.path}`} flexDirection="column">
          {row(
            `fr-${f.path}`,
            <Text wrap="truncate-end">
              <Text color={letter === 'A' ? 'success' : 'inactive'}>{letter}</Text>
              <Text> </Text>
              {repoRoot ? (
                <Link href={L.fileUrl(repoRoot, f.path)}>
                  <Text bold>{name}</Text>
                </Link>
              ) : (
                <Text bold>{name}</Text>
              )}
              {f.otherSessions ? <Text color="yellow">{`  ${L.CONFLICT_LABEL}`}</Text> : <Text />}
            </Text>,
            stat(f),
          )}
          {dir ? (
            <Box paddingLeft={2}>
              <Text color="inactive" wrap="truncate-middle">
                {dir}
              </Text>
            </Box>
          ) : (
            <Text />
          )}
        </Box>
      )
    })

    return (
      <Box
        flexDirection="column"
        paddingX={1}
        backgroundColor={C.PANE_BACKGROUND ?? undefined}
      >
        {row(
          'header',
          <Text bold>작업 파일</Text>,
          <Text>
            <Text color="inactive">{`${all.files} files  `}</Text>
            {stat(all)}
          </Text>,
        )}
        <Text key="divider" color="inactive">
          {'─'.repeat(Math.max(1, width - 2))}
        </Text>
        {commits.length > 0 ? label('l-commits', '커밋') : <Text key="nc" />}
        {commitRows}
        {commits.length > 0 ? label('l-after', '커밋 이후') : <Text key="na" />}
        {current.length === 0 ? (
          <Text key="empty" color="inactive">
            편집한 파일 없음
          </Text>
        ) : (
          fileRows
        )}
      </Box>
    )
  })
}
