/** 같은 레포를 수정 중인 다른 세션 감지용 저장소 키 */

/** 파일 수정 기록의 저장소 키, 값은 마지막 수정 시각(ms) */
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
