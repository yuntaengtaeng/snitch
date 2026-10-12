/** git 출력 해석 */

export type FileStat = {
  /** 레포 루트 기준 경로 */
  path: string
  /** 추가 줄 수, 바이너리면 null */
  added: number | null
  /** 삭제 줄 수, 바이너리면 null */
  deleted: number | null
  /** git 이 추적하지 않는 새 파일 여부 */
  isNew?: boolean
  /** 같은 파일을 최근 수정한 다른 세션 수 */
  otherSessions?: number
}

/** 파일 하나의 변경 내용, 새 파일은 전체 내용, 그 외는 unified diff */
export type FileChange = { isNew: boolean; text: string }

export type CommitEntry = {
  hash: string
  subject: string
  files: FileStat[]
}

/** `git diff --numstat` 출력의 파일별 줄 수 */
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

/** `git log -1 --format=%h%x00%s` 출력의 해시와 제목 */
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
