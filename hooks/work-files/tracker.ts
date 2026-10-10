import * as C from '../config'
import type { Host } from '../host'
import * as P from '../paths'
import { editKey, otherSessionsByFile } from './conflicts'
import { mentionsGitCommit, parseCommitHeader, parseNumstat, type CommitEntry, type FileStat } from './git'

export type WorkFilesView = {
  repoRoot: string | null
  commits: CommitEntry[]
  current: FileStat[]
  /** 파일별 마지막으로 편집한 에이전트 id */
  editedBy: ReadonlyMap<string, string>
}

/** 세션에서 편집한 파일, 커밋, HEAD 대비 변경량, 다른 세션 수정 기록 추적 */
export function createWorkFiles(deps: {
  getHost: () => Host | null
  /** 화면 갱신 요청 */
  onChange: () => void
  /** 커밋에 포함된 파일 (레포 기준 경로) */
  onCommitted: (paths: string[]) => void
}) {
  let cwd = ''
  let isWindows = false
  let sid = ''
  let repoRoot: string | null = null
  let head: string | null = null
  /** 레포 밖 파일까지 포함한 세션 편집 파일 (절대 경로) */
  const editedAll = new Set<string>()
  /** 마지막 커밋 이후 편집한 파일 (레포 기준 경로, 편집 순서) */
  const tracked: string[] = []
  const editedBy = new Map<string, string>()
  let commits: CommitEntry[] = []
  let current: FileStat[] = []
  let isRefreshing = false
  let isRefreshQueued = false

  function clearState() {
    editedAll.clear()
    tracked.length = 0
    editedBy.clear()
    commits = []
    current = []
  }

  async function git(args: string[]) {
    const host = deps.getHost()
    if (!host) return null
    return host.run(['git', '-c', 'core.quotePath=false', ...args]).catch(() => null)
  }

  async function readHead(): Promise<string | null> {
    const r = await git(['rev-parse', '--short', 'HEAD'])
    return r && r.exitCode === 0 ? r.stdout.trim() : null
  }

  async function countLines(rel: string): Promise<number | null> {
    const host = deps.getHost()
    if (!host || !repoRoot) return null
    const text = await host.readFile(`${repoRoot}/${rel}`).catch(() => null)
    if (text === null) return null
    if (text.length === 0) return 0
    return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  }

  async function recordMyEdit(rel: string) {
    const host = deps.getHost()
    if (!host || !repoRoot || !sid) return
    await host.storeSet(editKey(repoRoot, rel, sid, isWindows), await host.now())
  }

  async function forgetMyEdits(rels: string[]) {
    const host = deps.getHost()
    if (!host || !repoRoot || !sid) return
    for (const rel of rels) {
      await host.storeDelete(editKey(repoRoot, rel, sid, isWindows)).catch(() => undefined)
    }
  }

  /** 다른 세션이 최근 수정한 파일별 세션 수, 만료된 기록은 삭제 */
  async function otherSessions(): Promise<Map<string, number>> {
    const host = deps.getHost()
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
    return otherSessionsByFile(entries, repoRoot, sid, now, ttl, isWindows)
  }

  /** tracked 파일의 HEAD 대비 변경량, 변경 없는 파일 제외 */
  async function computeCurrent(): Promise<FileStat[]> {
    if (!repoRoot || tracked.length === 0) return []

    const paths = [...tracked]
    const diff = await git(['diff', '--numstat', '--no-renames', 'HEAD', '--', ...paths])
    const byPath = new Map<string, FileStat>()
    if (diff && diff.exitCode === 0) {
      for (const s of parseNumstat(diff.stdout)) byPath.set(s.path, s)
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

  /** current 재계산 후 화면 갱신, 실행 중 요청은 한 번으로 합침 */
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
    deps.onChange()
  }

  /** HEAD 가 바뀌었으면 새 커밋 기록과 커밋된 파일의 tracked 제외 */
  async function recordCommitIfAny() {
    const next = await readHead()
    if (next === null || next === head) {
      await refresh()
      return
    }
    head = next

    const header = await git(['log', '-1', '--format=%h%x00%s'])
    const parsed = header && header.exitCode === 0 ? parseCommitHeader(header.stdout) : null
    const show = await git(['show', '--numstat', '--no-renames', '--format=', 'HEAD'])
    const files = show && show.exitCode === 0 ? parseNumstat(show.stdout) : []

    commits = [...commits, { hash: parsed?.hash ?? next, subject: parsed?.subject ?? '', files }]

    const committed = files.map(f => f.path)
    deps.onCommitted(committed)
    await forgetMyEdits(tracked.filter(p => committed.includes(p)))
    const remaining = tracked.filter(p => !committed.includes(p))
    tracked.length = 0
    tracked.push(...remaining)

    await refresh()
  }

  return {
    refresh,

    /** 세션 시작 시 레포 루트와 HEAD 확인 */
    async start(nextCwd: string, sessionId: string) {
      cwd = nextCwd
      isWindows = P.isWindowsPath(nextCwd)
      sid = sessionId
      clearState()
      if (!C.ENABLE.workFiles) return
      const top = await git(['rev-parse', '--show-toplevel'])
      repoRoot = top && top.exitCode === 0 ? P.normalizePath(top.stdout.trim(), isWindows) : null
      head = await readHead()
    },

    /** /clear, /resume 시 편집 기록과 커밋 목록 초기화 */
    async clear() {
      await forgetMyEdits([...tracked])
      clearState()
      head = await readHead()
    },

    /** 편집한 파일 추가 후 레포 기준 경로 반환, 레포 밖이면 null */
    track(path: string, agentId: string): string | null {
      const abs = P.absolutePath(path, cwd, isWindows)
      editedAll.add(abs)
      const rel = repoRoot ? P.relativeTo(repoRoot, abs, isWindows) : null
      if (rel === null) return null
      if (!tracked.includes(rel)) tracked.push(rel)
      editedBy.set(rel, agentId)
      void recordMyEdit(rel)
        .then(() => refresh())
        .catch(() => undefined)
      return rel
    },

    /** Bash 실행 뒤 커밋 감지 또는 변경량 갱신 */
    async afterBash(command: string) {
      if (C.ENABLE.workFiles && mentionsGitCommit(command)) await recordCommitIfAny()
      else if (tracked.length > 0) await refresh()
    },

    /** 파일 하나의 HEAD 대비 변경 내용, 새 파일은 전체 내용, 변경 없으면 null */
    async changeOf(rel: string): Promise<string | null> {
      const diff = await git(['diff', '--no-renames', 'HEAD', '--', rel])
      if (diff && diff.exitCode === 0 && diff.stdout.trim()) return diff.stdout
      const untracked = await git(['ls-files', '--others', '--exclude-standard', '--', rel])
      const host = deps.getHost()
      if (!host || !repoRoot || !untracked || !untracked.stdout.trim()) return null
      const text = await host.readFile(`${repoRoot}/${rel}`).catch(() => null)
      return text === null ? null : `(새 파일)\n${text}`
    },

    editedCount: () => editedAll.size,
    hasTracked: () => tracked.length > 0,
    view: (): WorkFilesView => ({ repoRoot, commits, current, editedBy }),
  }
}

export type WorkFiles = ReturnType<typeof createWorkFiles>
