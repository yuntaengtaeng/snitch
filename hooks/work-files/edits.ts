import * as C from '../config'

/** 툴 호출 하나가 바꾼 파일 경로, 편집 툴은 성공한 호출의 입력 경로, Bash 는 결과의 bashEditDiff */
export function changedPaths(
  tool: string,
  input: Record<string, unknown>,
  result: unknown,
  isError: boolean,
): string[] {
  if ((C.EDIT_TOOLS as readonly string[]).includes(tool)) {
    if (isError) return []
    const p = input['file_path'] ?? input['notebook_path']
    return typeof p === 'string' && p.length > 0 ? [p] : []
  }
  return tool === 'Bash' ? bashChangedFiles(result) : []
}

/** Bash 툴 결과의 bashEditDiff 에서 꺼낸 변경 파일 경로, 없으면 빈 배열 */
export function bashChangedFiles(result: unknown): string[] {
  if (typeof result !== 'object' || result === null) return []
  const diff = (result as { bashEditDiff?: unknown }).bashEditDiff
  if (typeof diff !== 'object' || diff === null) return []
  const { changedFiles, files } = diff as { changedFiles?: unknown; files?: unknown }
  if (Array.isArray(changedFiles)) return changedFiles.filter((p): p is string => typeof p === 'string')
  if (!Array.isArray(files)) return []
  return files.flatMap(f => {
    const p = (f as { filePath?: unknown } | null)?.filePath
    return typeof p === 'string' ? [p] : []
  })
}
