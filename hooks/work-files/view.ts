import { splitPath } from '../paths'
import type { CommitEntry, FileStat } from './git'

/** 작업 파일 구역의 합계, 상태 문자, 텍스트 버전 */

export type Totals = { files: number; added: number; deleted: number }

export const CONFLICT_LABEL = '⚠ 다른 세션도 수정 중'

export function totalsOf(files: FileStat[]): Totals {
  let added = 0
  let deleted = 0
  for (const f of files) {
    added += f.added ?? 0
    deleted += f.deleted ?? 0
  }
  return { files: files.length, added, deleted }
}

/** 파일 상태 문자, A 는 새 파일, M 은 수정 */
export function statusLetter(f: FileStat): 'A' | 'M' {
  return f.isNew ? 'A' : 'M'
}

/** 줄 수 표시 문자열, 바이너리는 bin */
export function statText(f: { added: number | null; deleted: number | null }): string {
  if (f.added === null || f.deleted === null) return 'bin'
  return `+${f.added} −${f.deleted}`
}

/** 작업 파일 구역의 텍스트 버전 */
export function filesText(
  commits: CommitEntry[],
  current: FileStat[],
  reasons: ReadonlyMap<string, string> = new Map(),
): string {
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
    const reason = reasons.get(f.path)
    if (reason) lines.push(`    이유: ${reason}`)
    if (dir) lines.push(`    ${dir}`)
  }
  return lines.join('\n')
}

/** 작업 파일 구역의 예상 줄 수, reasonLines 는 이유 줄이 있는 파일 수 */
export function filesRows(commits: CommitEntry[], current: FileStat[], reasonLines = 0): number {
  const commitRows = commits.length > 0 ? commits.length + 4 : 0
  const fileRows = current.length === 0 ? 1 : current.length * 2 + reasonLines
  return 2 + commitRows + fileRows
}
