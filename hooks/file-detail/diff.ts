import type { FileChange } from '../work-files/git'

/** 파일 상세 화면에 그리는 변경 조각, 수정 요청의 단위 */
export type DiffPart = {
  /** 조각 순번, 화면 요소 주소와 단축키에 씀 */
  index: number
  /** Code 에 넘길 내용, diff 는 hunk 하나, 새 파일은 본문 */
  code: string
  format: 'diff' | 'source'
  /** 새 버전 기준 줄 범위, 예 42-58줄 */
  range: string
}

export type DiffParts = {
  parts: DiffPart[]
  /** 길어서 그리지 않은 부분 안내, 없으면 null */
  omitted: string | null
}

/** Code 한 번에 그릴 수 있는 글자 수보다 조금 작은 값 */
const CODE_MAX_CHARS = 90_000

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/

/** unified diff 를 hunk 단위로 나눔, 파일 머리글은 버림 */
export function splitHunks(diff: string): string[] {
  const hunks: string[][] = []
  for (const line of diff.replace(/\n$/, '').split('\n')) {
    if (HUNK_HEADER.test(line)) hunks.push([line])
    else hunks[hunks.length - 1]?.push(line)
  }
  return hunks.map(lines => lines.join('\n'))
}

/** hunk 의 새 버전 기준 줄 범위, 삭제만 있으면 그 위치 근처 */
export function hunkRange(hunk: string): string {
  const m = HUNK_HEADER.exec(hunk)
  if (!m) return ''
  const start = Number(m[1])
  const count = m[2] === undefined ? 1 : Number(m[2])
  if (count === 0) return `${start}줄 근처`
  return count === 1 ? `${start}줄` : `${start}-${start + count - 1}줄`
}

function lineCount(text: string): number {
  if (text.length === 0) return 0
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
}

/** 새 파일 본문을 줄 단위로 maxChars 안에서 자른 조각 하나 */
function newFileParts(text: string, maxChars: number): DiffParts {
  const total = lineCount(text)
  if (text.length <= maxChars) {
    return { parts: [{ index: 0, code: text, format: 'source', range: `1-${total}줄` }], omitted: null }
  }
  const cut = text.slice(0, maxChars)
  const shown = cut.slice(0, Math.max(0, cut.lastIndexOf('\n')))
  const shownLines = lineCount(shown)
  return {
    parts: [{ index: 0, code: shown, format: 'source', range: `1-${shownLines}줄` }],
    omitted: `뒤 ${total - shownLines}줄 생략`,
  }
}

/** 변경 내용을 화면에 그릴 조각으로 나눔, hunk 를 자르지 않고 maxChars 를 넘는 뒤쪽 hunk 는 생략 */
export function diffParts(change: FileChange, maxChars: number): DiffParts {
  if (change.isNew) return newFileParts(change.text, maxChars)

  const parts: DiffPart[] = []
  let used = 0
  const hunks = splitHunks(change.text)
  for (const hunk of hunks) {
    const fits = used + hunk.length <= maxChars || (parts.length === 0 && hunk.length <= CODE_MAX_CHARS)
    if (!fits) break
    parts.push({ index: parts.length, code: hunk, format: 'diff', range: hunkRange(hunk) })
    used += hunk.length
  }
  const rest = hunks.length - parts.length
  return { parts, omitted: rest > 0 ? `나머지 ${rest}개 부분 생략` : null }
}

/** 조각들이 차지할 대략의 줄 수 */
export function partsRows(parts: readonly DiffPart[]): number {
  return parts.reduce((n, p) => n + lineCount(p.code), 0)
}
