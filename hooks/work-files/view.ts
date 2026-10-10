import { splitPath } from '../paths'
import type { CommitEntry, FileStat } from './git'

/** 작업 파일 구역의 합계, 상태 문자, 텍스트 버전 */

export type Totals = { files: number; added: number; deleted: number }

/** 파일 이름 아래에 붙는 설명, 변경 이유와 위치(폴더, 고친 서브에이전트 작업) */
export type FileNote = { reason?: string; place: string }

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

/** 폴더와 고친 서브에이전트 작업 이름을 쉼표로 이은 위치 문구 */
export function placeOf(path: string, task: string): string {
  return [splitPath(path).dir, task].filter(Boolean).join(', ')
}

/** 변경 파일과 커밋 구역의 텍스트 버전 */
export function filesText(
  commits: CommitEntry[],
  current: FileStat[],
  noteOf: (path: string) => FileNote = path => ({ place: placeOf(path, '') }),
): string {
  const lines = [`변경 파일 ${current.length}`]
  if (current.length === 0) lines.push('  없음')
  for (const f of current) {
    const warn = f.otherSessions ? `  ${CONFLICT_LABEL}` : ''
    lines.push(`  ${statusLetter(f)} ${splitPath(f.path).name}  ${statText(f)}${warn}`)
    const { reason, place } = noteOf(f.path)
    if (reason) lines.push(`    ${reason}`)
    if (place) lines.push(`    ${place}`)
  }

  if (commits.length > 0) {
    lines.push('', `커밋 ${commits.length}`)
    for (const c of commits) {
      lines.push(`  ● ${c.hash} ${c.subject}  ${statText(totalsOf(c.files))}`)
    }
  }
  return lines.join('\n')
}

/** 변경 파일과 커밋 구역의 예상 줄 수, noteLines 는 파일 아래 설명 줄 수의 합 */
export function filesRows(commits: CommitEntry[], current: FileStat[], noteLines = 0): number {
  const fileRows = 2 + Math.max(1, current.length) + noteLines
  const commitRows = commits.length > 0 ? 2 + commits.length : 0
  return fileRows + commitRows
}
