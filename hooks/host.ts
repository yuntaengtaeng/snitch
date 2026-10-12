import type { RenderSurface } from 'claude-code'

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
  /** 패널 본문을 맨 위로 스크롤 */
  scrollPaneTop: () => Promise<void>
  /** 패널 안의 입력칸이나 버튼으로 포커스 이동 */
  focusPane: (key: string) => Promise<void>
  /** 사용자 말투로 프롬프트 전송, 진행 중인 응답이 있으면 끝난 뒤 실행 */
  submitPrompt: (text: string) => Promise<void>
  /** 버튼을 누른 화면의 클립보드에 복사, 복사됐는지 반환 */
  copy: (text: string, surface: RenderSurface) => Promise<boolean>
  /** 대화창 위에 몇 초 동안 뜨는 짧은 알림 */
  toast: (text: string) => void
  paneState: () => Promise<{ isOpen: boolean; isPlaced: boolean; isShown: boolean }>
  every: (ms: number, fn: () => void) => { cancel: () => void }
  /** REASON_MODEL 의 답 텍스트, 답이 없으면 null */
  complete: (prompt: string, system: string) => Promise<string | null>
  /** 이 세션의 서브에이전트 id 와 상태 */
  listAgents: () => Promise<{ id: string; status: string }[]>
}
