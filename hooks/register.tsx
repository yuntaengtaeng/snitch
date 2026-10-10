import type { On, RenderChildren } from 'claude-code'

import * as C from './config'
import * as L from './logic'

/**
 * snitch
 *
 * 1) 상태줄: 모델 · effort · 요금제 한도 사용률 · 오늘 누적 비용(모든 세션 합) · 세션 작업량
 * 2) /changes: Claude가 이 세션에서 편집한 파일 패널.
 *    Claude가 커밋하면 커밋 줄로 쌓이고, 그 아래에 이후 변경이 다시 쌓인다.
 *    새 세션(/clear, /resume 포함)에서는 비어서 시작한다.
 *    전체화면 레이아웃이면 세션 시작 후 우측에 자동으로 띄운다 (PANE_AUTO_OPEN).
 *    같은 폴더의 다른 세션도 최근에 수정한 파일에는 "⚠ 다른 세션도 수정 중"을 표시한다.
 */

/**
 * session.start 의 $ 를 감싼 함수 모음 (공식 /diff mod 와 같은 패턴).
 * 툴 실행 뒤처럼 hook 밖에서 이어지는 작업이 이것을 통해 $ 에 닿는다.
 */
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
  toast: (text: string) => void
  invalidate: () => void
  openPane: (rows: number) => Promise<void>
  closePane: () => Promise<void>
  paneState: () => Promise<{ isOpen: boolean; isPlaced: boolean; isShown: boolean }>
  every: (ms: number, fn: () => void) => { cancel: () => void }
}

export function register(on: On) {
  let host: Host | null = null
  let cwd = ''
  /** Windows 에서 실행 중인지 (cwd 가 C:\... 형식인지로 판단) */
  let isWindows = false

  // 상태줄: 메인 대화가 실제로 보낸 마지막 요청의 모델 · effort
  let model: string | null = null
  let effort: string | null = null

  // 상태줄
  let rateLimits: L.RateLimit[] = []
  let todayUsd: number | null = null
  let costDay = ''
  let costDayBaseUsd = 0
  let lastSessionUsd = 0
  let hasPrunedCosts = false
  const editedAll = new Set<string>()
  let commands = 0

  // 작업 파일 패널
  let repoRoot: string | null = null
  let head: string | null = null
  /** 현재 구간(마지막 커밋 이후)에 Claude가 편집한 파일, 편집 순서대로 (레포 기준 경로) */
  const tracked: string[] = []
  let commits: L.CommitEntry[] = []
  let current: L.FileStat[] = []
  let isPaneOpen = false
  let isRefreshing = false
  let isRefreshQueued = false
  /** 이 세션에서 자동 열기를 이미 시도했는지 (사용자가 닫으면 다시 열지 않는다) */
  let hasAutoOpened = false
  /** 이 세션의 id (다른 세션의 수정 기록과 구분하는 데 쓴다) */
  let sid = ''
  let poller: { cancel: () => void } | null = null

  // ───────────── 공통 ─────────────

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

  function editedPathOf(input: Record<string, unknown>): string | null {
    const p = input['file_path'] ?? input['notebook_path']
    return typeof p === 'string' && p.length > 0 ? absolute(p) : null
  }

  // ───────────── git ─────────────

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

  /** tracked 파일들의 현재 변경량을 git 으로 다시 읽는다 */
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

    // 편집 순서 유지, 되돌려서 변경이 없어진 파일은 빠진다
    return paths.flatMap(p => {
      const s = byPath.get(p)
      if (!s) return []
      const n = elsewhere.get(isWindows ? p.toLowerCase() : p) ?? 0
      return [n > 0 ? { ...s, otherSessions: n } : s]
    })
  }

  // ───────────── 다른 세션의 수정 기록 ─────────────

  /** 내가 이 파일을 방금 수정했다고 기록한다 */
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

  /** 같은 폴더의 다른 세션이 최근 수정한 파일 → 세션 수. 오래된 기록은 지운다 */
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

  /** Claude의 Bash 가 git commit 을 실행한 뒤: HEAD 가 바뀌었으면 커밋으로 쌓는다 */
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

    // 커밋에 들어간 파일은 현재 구간에서 뺀다 (일부만 커밋했으면 나머지는 남는다)
    const committed = new Set(files.map(f => f.path))
    await forgetMyEdits(tracked.filter(p => committed.has(p)))
    const remaining = tracked.filter(p => !committed.has(p))
    tracked.length = 0
    tracked.push(...remaining)

    await refresh()
  }

  // ───────────── 오늘 누적 비용 ─────────────

  async function recordCost(sessionUsd: number) {
    if (!host) return
    const day = L.dayKey(await host.now())

    // 세션이 자정을 넘기면, 그때까지의 비용은 어제 몫으로 두고 오늘은 0부터 센다
    if (costDay === '') {
      costDay = day
    } else if (day !== costDay) {
      costDayBaseUsd = lastSessionUsd
      costDay = day
    }
    lastSessionUsd = sessionUsd

    const sid = await host.sessionId()
    await host.storeSet(`cost:${day}:${sid}`, Math.max(0, sessionUsd - costDayBaseUsd))

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

  // ───────────── hooks ─────────────

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    isWindows = L.isWindowsPath(e.cwd)
    model = null
    effort = null
    host = {
      run: argv => $.process.run(argv, { timeoutMs: 10_000 }),
      readFile: path => $.fs.read(path),
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      storeDelete: key => $.store.delete(key),
      storeKeys: () => $.store.keys(),
      now: () => $.clock.now(),
      sessionId: () => $.session.id(),
      status: text => $.ui.status(text),
      toast: text => $.ui.toast(text, { timeoutMs: 6000 }),
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

    resetSession()
    hasAutoOpened = false
    isPaneOpen = false
    sid = await $.session.id().catch(() => '')

    // 패널이 열려 있는 동안 다른 세션의 수정 기록을 주기적으로 다시 확인한다
    poller?.cancel()
    poller = host.every(C.CONFLICT_POLL_SEC * 1000, () => {
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

  // /clear, /resume 은 새 대화이므로 패널과 작업량을 비운다
  on('command.run', { command: ['clear', 'resume'] }, async ($, e, next) => {
    const r = await next(e)
    await forgetMyEdits([...tracked])
    resetSession()
    head = await readHead()
    updateStatus()
    if (isPaneOpen) host?.invalidate()
    return r
  })

  // 모델 요청 직전: 메인 대화가 실제로 쓰는 모델 · effort 를 읽기만 하고 그대로 보낸다
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

  // 요금제 한도·비용이 바뀔 때마다 엔진이 알려준다
  on('session.measure', async ($, e, next) => {
    if (C.ENABLE.statusLine) {
      rateLimits = e.rateLimits.map(r => ({ kind: r.kind, percentUsed: r.percentUsed }))
      if (e.cost) await recordCost(e.cost.usd).catch(() => undefined)
      updateStatus()
    }
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r

    const input = e as unknown as Record<string, unknown>
    const isError = r.isError === true
    const isEdit = (C.EDIT_TOOLS as readonly string[]).includes(e.tool)

    // 작업량 · 작업 파일
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
        // 포매터·되돌리기 등으로 줄 수가 바뀌었을 수 있다
        void refresh().catch(() => undefined)
      }
    }
    updateStatus()
    return r
  })

  // /changes : 패널을 보여주거나 닫는다.
  // 자동으로 열렸지만 너비 때문에 숨어 있는 패널은 닫지 않고 보여준다 (사용자 요청으로 연 패널은 너비와 상관없이 놓인다).
  // 전체화면 레이아웃인데 110칸 미만이거나 "/changes text" 면 텍스트로 출력한다.
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

  // 전체화면 레이아웃이 확인되면 세션당 한 번 우측에 자동으로 띄운다.
  // 세션 시작 이벤트에는 화면 모드 정보가 없어서, 입력창 힌트를 그릴 때 오는 viewport 로 판단한다.
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

  on('ui.render', { component: 'Pane' }, ($, e, next) => {
    if (e.requestId !== C.PANE_ID) return next(e)

    const { Box, Text, Link } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)
    const all = L.totalsOf(current)

    // 줄 수: + 는 추가 색, − 는 삭제 색 (테마 색이라 밝은/어두운 테마 모두 맞춰진다). 0 은 흐리게
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
