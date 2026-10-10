/** 기능별 사용 여부 */
export const ENABLE = {
  /** 상태줄 */
  statusLine: true,
  /** 상태줄 맨 앞의 모델 · effort */
  modelEffort: true,
  /** 작업 파일 패널과 /changes 명령 */
  workFiles: true,
  /** 작업 파일의 변경 이유 한 줄, 턴마다 REASON_MODEL 한 번 호출 */
  changeReasons: true,
}

export const PANE_ID = 'k-work-files'
export const PANE_TITLE = 'snitch'
export const CHANGES_COMMAND = 'changes'
export const DASHBOARD_COMMAND = 'snitch'

/** 작업 파일로 추적할 편집 툴 */
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const

/** 전체화면 레이아웃에서 세션마다 패널을 자동으로 열지 여부 */
export const PANE_AUTO_OPEN = true

/** 패널을 열 때 요청하는 최대 높이(줄) */
export const PANE_MAX_ROWS = 30

/** 끝난 서브에이전트를 대시보드에 남겨 두는 시간(초) */
export const AGENT_KEEP_FINISHED_SEC = 60

/** 작업 중이거나 막 끝난 에이전트가 있을 때 대시보드를 다시 그리는 주기(초) */
export const AGENT_TICK_SEC = 5

/** 자동으로 연 패널을 다시 그리는 시점(ms), 두 번째 시점에 보이지 않으면 안내 */
export const PANE_SETTLE_MS = [500, 2000] as const

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

/** 변경 이유를 요약할 모델 (별칭 또는 모델 ID) */
export const REASON_MODEL = 'haiku'

/** 변경 이유 요약 요청에 넣을 diff 최대 글자 수 (파일 전체 합) */
export const REASON_DIFF_CHARS = 12_000

/** 변경 이유 한 줄의 최대 글자 수 */
export const REASON_MAX_CHARS = 30

/** 변경 이유 요약 요청의 제한 시간(초) */
export const REASON_TIMEOUT_SEC = 30
