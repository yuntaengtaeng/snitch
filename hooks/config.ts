/** 기능별 사용 여부 */
export const ENABLE = {
  /** 상태줄 */
  statusLine: true,
  /** 상태줄 맨 앞의 모델 · effort */
  modelEffort: true,
  /** 작업 파일 패널과 /changes 명령 */
  workFiles: true,
}

export const PANE_ID = 'k-work-files'
export const PANE_TITLE = '작업 파일'
export const CHANGES_COMMAND = 'changes'

/** 작업 파일로 추적할 편집 툴 */
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const

/** 전체화면 레이아웃에서 세션마다 패널을 자동으로 열지 여부 */
export const PANE_AUTO_OPEN = true

/** 사이드바 패널의 기본 너비(칸) */
export const PANE_DOCK_COLUMNS = 56

/** 전체화면 레이아웃에서 패널 대신 텍스트로 출력하는 너비 기준(칸) */
export const PANE_MIN_COLUMNS = 110

/** 다른 세션의 수정 기록을 유효하게 보는 시간(분) */
export const CONFLICT_TTL_MIN = 30

/** 패널이 열려 있을 때 다른 세션의 수정 기록을 다시 읽는 주기(초) */
export const CONFLICT_POLL_SEC = 20

/** 패널 배경색. null 이면 테마 배경색 */
export const PANE_BACKGROUND: string | null = null

/** 비용 기록 보관 기간(일) */
export const COST_KEEP_DAYS = 7
