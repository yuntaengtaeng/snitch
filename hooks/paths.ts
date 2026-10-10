/** 경로 정규화, 레포 기준 경로 변환, file URL */

/** Windows 경로(C:\, C:/, \\server) 여부 */
export function isWindowsPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
}

/** 비교용 경로, 구분자는 /, 끝의 / 제거, Windows 는 드라이브 대문자와 /c/ 형식 변환 */
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

/** cwd 기준으로 푼 정규화된 절대 경로 */
export function absolutePath(path: string, cwd: string, isWindows: boolean): string {
  if (isAbsolutePath(path)) return normalizePath(path, isWindows)
  return normalizePath(`${normalizePath(cwd, isWindows)}/${path}`, isWindows)
}

/** 절대 경로의 레포 루트 기준 경로, 레포 밖이면 null, Windows 는 대소문자 무시 */
export function relativeTo(root: string, absPath: string, isWindows = false): string | null {
  const r = normalizePath(root, isWindows)
  const a = normalizePath(absPath, isWindows)
  const base = r.endsWith('/') ? r : `${r}/`
  const matches = isWindows
    ? a.toLowerCase().startsWith(base.toLowerCase())
    : a.startsWith(base)
  return matches ? a.slice(base.length) : null
}

/** 경로의 파일 이름과 폴더 */
export function splitPath(path: string): { name: string; dir: string } {
  const i = path.lastIndexOf('/')
  return i < 0 ? { name: path, dir: '' } : { name: path.slice(i + 1), dir: path.slice(0, i) }
}

/** 레포 루트와 레포 기준 경로로 만든 file:// URL */
export function fileUrl(root: string, rel: string): string {
  const full = `${root.replace(/\/+$/, '')}/${rel}`
  const encoded = full
    .split('/')
    .map(seg => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
    .join('/')
  return encoded.startsWith('/') ? `file://${encoded}` : `file:///${encoded}`
}
