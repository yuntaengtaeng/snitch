/** Claude Code API 에 의존하지 않는 순수 함수 */

export type FileStat = {
  /** 레포 루트 기준 경로 */
  path: string
  /** 추가 줄 수. 바이너리면 null */
  added: number | null
  /** 삭제 줄 수. 바이너리면 null */
  deleted: number | null
  /** git 이 추적하지 않는 새 파일 여부 */
  isNew?: boolean
  /** 같은 파일을 최근 수정한 다른 세션 수 */
  otherSessions?: number
}

export type CommitEntry = {
  hash: string
  subject: string
  files: FileStat[]
}

/** `git diff --numstat` 출력을 파일별 줄 수로 변환 */
export function parseNumstat(stdout: string): FileStat[] {
  const stats: FileStat[] = []
  for (const line of stdout.split('\n')) {
    const parts = line.split('\t')
    if (parts.length < 3) continue
    const [a, d, ...rest] = parts
    const path = rest.join('\t')
    if (!path) continue
    stats.push({
      path,
      added: a === '-' ? null : Number(a),
      deleted: d === '-' ? null : Number(d),
    })
  }
  return stats
}

/** `git log -1 --format=%h%x00%s` 출력을 해시와 제목으로 변환 */
export function parseCommitHeader(stdout: string): { hash: string; subject: string } | null {
  const line = stdout.replace(/\n$/, '')
  const sep = line.indexOf('\u0000')
  if (sep <= 0) return null
  return { hash: line.slice(0, sep), subject: line.slice(sep + 1) }
}

/** 셸 명령에 git commit 이 들어 있는지 여부 */
export function mentionsGitCommit(command: string): boolean {
  return /\bgit\b(\s+(-[cC]\s+\S+|--?[\w-]+(=\S+)?))*\s+commit\b/.test(command)
}

/** Windows 경로(C:\, C:/, \\server) 여부 */
export function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

/**
 * 비교용 경로 정규화: 구분자는 /, 끝의 / 제거.
 * Windows 에서는 드라이브 문자를 대문자로, /c/... 형식을 C:/... 로 변환
 */
export function normalizePath(p: string, isWindows: boolean): string {
  let n = p.replace(/\\/g, '/')
  if (isWindows) {
    const msys = /^\/([A-Za-z])(\/|$)/.exec(n)
    if (msys) n = `${(msys[1] ?? '').toUpperCase()}:/${n.slice(3)}`
    n = n.replace(/^([a-z]):/, (_m, d: string) => `${d.toUpperCase()}:`)
  }
  return n.replace(/\/+$/, '') || '/'
}

export function isAbsolutePath(p: string): boolean {
  return p.startsWith('/') || isWindowsPath(p)
}

/** 절대 경로를 레포 루트 기준 경로로 변환. 레포 밖이면 null. Windows 는 대소문자 무시 */
export function relativeTo(root: string, absPath: string, isWindows = false): string | null {
  const r = normalizePath(root, isWindows)
  const a = normalizePath(absPath, isWindows)
  const base = r.endsWith('/') ? r : `${r}/`
  const matches = isWindows
    ? a.toLowerCase().startsWith(base.toLowerCase())
    : a.startsWith(base)
  return matches ? a.slice(base.length) : null
}

/** 모델 ID 를 표시용 이름으로 변환 (claude-opus-5-5 → Opus 5.5) */
export function shortModelName(id: string): string {
  const core = id.replace(/^claude-/, '').replace(/-\d{8}$/, '')
  const m = /^([a-z]+)-(\d+)(?:-(\d+))?(.*)$/.exec(core)
  if (!m) return core || id
  const family = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  const version = m[3] !== undefined ? `${m[2]}.${m[3]}` : (m[2] ?? '')
  return `${family} ${version}${m[4] ?? ''}`
}

/** 경로를 파일 이름과 폴더로 분리 */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf('/')
  return i < 0 ? { name: path, dir: '' } : { name: path.slice(i + 1), dir: path.slice(0, i) }
}

/** 레포 루트와 레포 기준 경로로 file:// URL 생성 */
export function fileUrl(root: string, rel: string): string {
  const full = `${root.replace(/\/+$/, '')}/${rel}`
  const encoded = full
    .split('/')
    .map(seg => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
}

export type Totals = { files: number; added: number; deleted: number }

export function totalsOf(files: FileStat[]): Totals {
  let added = 0
  let deleted = 0
  for (const f of files) {
    added += f.added ?? 0
    deleted += f.deleted ?? 0
  }
  return { files: files.length, added, deleted }
}

/** 파일 상태 문자. A: 새 파일, M: 수정 */
export function statusLetter(f: FileStat): 'A' | 'M' {
  return f.isNew ? 'A' : 'M'
}

/** 줄 수 표시 문자열. 바이너리는 bin */
export function statText(f: { added: number | null; deleted: number | null }): string {
  if (f.added === null || f.deleted === null) return 'bin'
  return `+${f.added} −${f.deleted}`
}

export const CONFLICT_LABEL = '⚠ 다른 세션도 수정 중'

/** 작업 파일 패널의 텍스트 버전 */
export function panelText(commits: CommitEntry[], current: FileStat[]): string {
  const all = totalsOf(current)
  const lines: string[] = []
  lines.push(`작업 파일 · ${all.files} files  +${all.added} −${all.deleted}`)

  if (commits.length > 0) {
    lines.push('', '커밋')
    for (const c of commits) {
      lines.push(`  ● ${c.hash} ${c.subject}  ${statText(totalsOf(c.files))}`)
    }
    lines.push('', '커밋 이후')
  }

  if (current.length === 0) {
    lines.push('  편집한 파일 없음')
  }
  for (const f of current) {
    const { name, dir } = splitPath(f.path)
    const warn = f.otherSessions ? `  ${CONFLICT_LABEL}` : ''
    lines.push(`  ${statusLetter(f)} ${name}  ${statText(f)}${warn}`)
    if (dir) lines.push(`    ${dir}`)
  }
  return lines.join('\n')
}

/** 패널 내용의 예상 줄 수 */
export function panelRows(commits: CommitEntry[], current: FileStat[]): number {
  const commitRows = commits.length > 0 ? commits.length + 4 : 0
  const fileRows = current.length === 0 ? 1 : current.length * 2
  return 2 + commitRows + fileRows
}

/** 파일 수정 기록의 저장소 키. 값은 마지막 수정 시각(ms) */
export function editKey(repo: string, rel: string, sid: string, isWindows: boolean): string {
  const r = isWindows ? repo.toLowerCase() : repo
  const f = isWindows ? rel.toLowerCase() : rel
  return `edit:${r}|${f}|${sid}`
}

export function parseEditKey(key: string): { repo: string; rel: string; sid: string } | null {
  if (!key.startsWith('edit:')) return null
  const body = key.slice(5)
  const last = body.lastIndexOf('|')
  const first = body.indexOf('|')
  if (first < 0 || last <= first) return null
  return { repo: body.slice(0, first), rel: body.slice(first + 1, last), sid: body.slice(last + 1) }
}

/** 같은 레포에서 ttlMs 안에 다른 세션이 수정한 파일별 세션 수 */
export function otherSessionsByFile(
  entries: { key: string; at: number }[],
  repo: string,
  mySid: string,
  now: number,
  ttlMs: number,
  isWindows: boolean,
): Map<string, number> {
  const r = isWindows ? repo.toLowerCase() : repo
  const sessions = new Map<string, Set<string>>()
  for (const { key, at } of entries) {
    const k = parseEditKey(key)
    if (!k || k.repo !== r || k.sid === mySid || now - at > ttlMs) continue
    const set = sessions.get(k.rel) ?? new Set<string>()
    set.add(k.sid)
    sessions.set(k.rel, set)
  }
  return new Map([...sessions].map(([rel, set]) => [rel, set.size]))
}

export type RateLimit = { kind: string; percentUsed: number }

const LIMIT_LABEL: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: '지출한도',
}

export function formatUsd(usd: number): string {
  return usd < 10 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(1)}`
}

/** 상태줄 문자열 */
export function statusText(input: {
  model?: string | null
  effort?: string | null
  rateLimits: RateLimit[]
  todayUsd: number | null
  editedFiles: number
  commands: number
}): string {
  const parts: string[] = []

  if (input.model) {
    parts.push(input.effort ? `${shortModelName(input.model)} · ${input.effort}` : shortModelName(input.model))
  }

  const limits = input.rateLimits
    .map(r => `${LIMIT_LABEL[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%`)
    .join(' · ')
  if (limits) parts.push(`한도 ${limits}`)

  if (input.todayUsd !== null) parts.push(`오늘 ${formatUsd(input.todayUsd)}`)

  parts.push(`세션 편집 ${input.editedFiles}파일 · 명령 ${input.commands}회`)

  return parts.join('  |  ')
}

/** 로컬 날짜 키 (YYYY-MM-DD) */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** 비용 기록 키(cost:<날짜>:<세션>)의 날짜 */
export function dayOfCostKey(key: string): string | null {
  const m = /^cost:(\d{4}-\d{2}-\d{2}):/.exec(key)
  return m ? (m[1] ?? null) : null
}
