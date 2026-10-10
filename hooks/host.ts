/** hook 밖에서 이어지는 비동기 작업이 쓰는 $ 함수 */
export type Host = {
  run: (argv: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  readFile: (path: string) => Promise<string>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  storeDelete: (key: string) => Promise<void>
  storeKeys: () => Promise<string[]>
  now: () => Promise<number>
  status: (text: string | undefined) => void
  invalidate: () => void
  /** 패널 열기, 사용자가 열지 않은 패널은 좁은 화면이면 배치 대기 */
  openPane: (rows: number) => Promise<{ isPlaced: boolean }>
  closePane: () => Promise<void>
  paneState: () => Promise<{ isOpen: boolean; isPlaced: boolean; isShown: boolean }>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  /** REASON_MODEL 의 답 텍스트, 답이 없으면 null */
  complete: (prompt: string, system: string) => Promise<string | null>
  /** 이 세션의 서브에이전트 id 와 상태 */
  listAgents: () => Promise<{ id: string; status: string }[]>
}
