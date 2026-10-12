import * as C from '../config'
import type { Host } from '../host'
import * as P from '../paths'
import { editKey, otherSessionsByFile } from './conflicts'
import {
  matchTracked,
  mentionsGitCommit,
  parseCommitHeader,
  parseNumstat,
  type CommitEntry,
  type FileChange,
  type FileStat,
} from './git'

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
  /** 커밋이나 되돌리기로 HEAD 와 같아져 추적을 끝낸 파일 (레포 기준 경로) */
  onCleaned: (paths: string[]) => void
}) {
  let cwd = ''
  let isWindows = false
  let sid = ''
  let repoRoot: string | null = null
  let head: string | null = null
  /** 마지막 커밋 이후 편집한 파일 (레포 기준 경로, 편집 순서) */
  const tracked: string[] = []
  const editedBy = new Map<string, string>()
  /** 파일별 마지막 편집 순번, 변경량 계산 중에 다시 편집된 파일은 추적 유지 */
  const editSeq = new Map<string, number>()
  let seq = 0
  let commits: CommitEntry[] = []
  let current: FileStat[] = []
  let isRefreshing = false
  let isRefreshQueued = false

  function clearState() {
    tracked.length = 0
    editedBy.clear()
    editSeq.clear()
    commits = []
    current = []
  }

  async function git(args: string[]) {
    const host = deps.getHost()
    if (!host) return null
    const at = repoRoot ? ['-C', repoRoot] : []
    return host.run(['git', '--no-optional-locks', ...at, '-c', 'core.quotePath=false', ...args]).catch(() => null)
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

  /** tracked 파일의 HEAD 대비 변경량과 HEAD 와 같아진 파일, git 이 실패하면 null */
  async function computeCurrent(): Promise<{ stats: FileStat[]; clean: string[] } | null> {
    if (!repoRoot || tracked.length === 0) return { stats: [], clean: [] }

    const paths = [...tracked]
    const diff = await git(['diff', '--numstat', '--no-renames', 'HEAD', '--', ...paths])
    if (!diff || diff.exitCode !== 0) return null
    const stats = parseNumstat(diff.stdout)

    const others = await git(['ls-files', '--others', '--exclude-standard', '--', ...paths])
    if (!others || others.exitCode !== 0) return null
    for (const rel of others.stdout.split('\n').filter(Boolean)) {
      stats.push({ path: rel, added: await countLines(rel), deleted: 0, isNew: true })
    }

    const elsewhere = await otherSessions().catch(() => new Map<string, number>())
    const { changed, clean } = matchTracked(paths, stats, isWindows)
    return {
      stats: changed.map(s => {
        const n = elsewhere.get(isWindows ? s.path.toLowerCase() : s.path) ?? 0
        return n > 0 ? { ...s, otherSessions: n } : s
      }),
      clean,
    }
  }

  /** HEAD 와 같아진 파일을 추적에서 뺌, startSeq 뒤에 다시 편집된 파일은 유지 */
  async function untrack(clean: string[], startSeq: number) {
    const done = clean.filter(p => (editSeq.get(p) ?? 0) <= startSeq)
    if (done.length === 0) return
    const remaining = tracked.filter(p => !done.includes(p))
    tracked.length = 0
    tracked.push(...remaining)
    done.forEach(p => {
      editedBy.delete(p)
      editSeq.delete(p)
    })
    await forgetMyEdits(done)
    deps.onCleaned(done)
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
        const startSeq = seq
        const next = await computeCurrent()
        if (next === null) continue
        current = next.stats
        await untrack(next.clean, startSeq)
      } while (isRefreshQueued)
    } finally {
      isRefreshing = false
    }
    deps.onChange()
  }

  /** 파일 하나의 HEAD 대비 변경 내용, 변경 없으면 null */
  async function changeOf(rel: string): Promise<FileChange | null> {
    const diff = await git(['diff', '--no-renames', 'HEAD', '--', rel])
    if (diff && diff.exitCode === 0 && diff.stdout.trim()) return { isNew: false, text: diff.stdout }
    const untracked = await git(['ls-files', '--others', '--exclude-standard', '--', rel])
    const host = deps.getHost()
    if (!host || !repoRoot || !untracked || !untracked.stdout.trim()) return null
    const text = await host.readFile(`${repoRoot}/${rel}`).catch(() => null)
    return text === null ? null : { isNew: true, text }
  }

  async function snapshot(rel: string): Promise<string | null> {
    if (!repoRoot) return null
    const r = await git(['hash-object', '-w', '--', `${repoRoot}/${rel}`])
    return r && r.exitCode === 0 ? r.stdout.trim() || null : null
  }

  /** HEAD 가 바뀌었으면 새 커밋 기록, 커밋된 파일은 refresh 에서 추적 종료 */
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

    /** cwd 기준 경로나 절대 경로의 레포 기준 경로, 레포 밖이면 null */
    repoPathOf(path: string): string | null {
      return repoRoot ? P.relativeTo(repoRoot, P.absolutePath(path, cwd, isWindows), isWindows) : null
    },

    /** 편집한 파일 추가 후 레포 기준 경로 반환, 레포 밖이면 null */
    track(path: string, agentId: string): string | null {
      const rel = repoRoot ? P.relativeTo(repoRoot, P.absolutePath(path, cwd, isWindows), isWindows) : null
      if (rel === null) return null
      if (!tracked.includes(rel)) tracked.push(rel)
      editedBy.set(rel, agentId)
      editSeq.set(rel, ++seq)
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

    changeOf,

    /** 지금 파일 내용을 git 객체로 저장한 blob id, 파일이 없으면 null */
    snapshot,

    /** snapshot 이후 바뀐 내용, snapshot 이 없거나 파일이 사라졌으면 HEAD 대비 변경 내용 */
    async changeSince(rel: string, blob: string | null): Promise<FileChange | null> {
      const now = blob === null ? null : await snapshot(rel)
      if (blob === null || now === null) return changeOf(rel)
      if (now === blob) return null
      const diff = await git(['diff', blob, now])
      return diff && diff.exitCode === 0 && diff.stdout.trim() ? { isNew: false, text: diff.stdout } : null
    },

    hasTracked: () => tracked.length > 0,
    view: (): WorkFilesView => ({ repoRoot, commits, current, editedBy }),
  }
}

export type WorkFiles = ReturnType<typeof createWorkFiles>
