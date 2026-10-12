/** 기능별 사용 여부 */
export const ENABLE = {
  /** 상태줄 */
  statusLine: true,
  /** 상태줄 맨 앞의 모델 · effort */
  modelEffort: true,
  /** 작업 파일 패널과 /changes 명령 */
  workFiles: true,
  /** 코드를 고친 Claude 가 change_note 도구로 직접 남기는 변경 이유 */
  changeNotes: true,
  /** 메모가 없는 파일의 변경 이유를 턴 끝에 REASON_MODEL 로 요약 */
  changeReasons: true,
}

export const PANE_ID = 'k-work-files'
export const PANE_TITLE = 'snitch'
export const CHANGES_COMMAND = 'changes'
export const DASHBOARD_COMMAND = 'snitch'

/** 변경 메모 도구가 모델에게 보이는 전체 이름 */
export const NOTE_TOOL_ID = 'mcp__snitch__change_note'

/** 작업 파일로 추적할 편집 툴 */
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const

/** 전체화면 레이아웃에서 세션마다 패널을 자동으로 열지 여부 */
export const PANE_AUTO_OPEN = true

/** 패널을 열 때 요청하는 최대 높이(줄) */
export const PANE_MAX_ROWS = 30

/** 작업 중인 에이전트가 있을 때 경과 시간과 상태를 갱신하는 주기(초) */
export const AGENT_TICK_SEC = 5

/** 대시보드 제목 줄의 한도 막대 칸 수 */
export const LIMIT_BAR_SEGMENTS = 6

/** 패널 제목 줄에 한도 초기화 시각을 붙이는 최소 너비(칸) */
export const RESET_MIN_COLUMNS = 50

/** 파일 이름을 file:// 링크로 표시할지 여부, 링크를 지원하지 않는 터미널에서는 주소가 그대로 보임 */
export const PANE_FILE_LINKS = false

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

/** 파일 상세 화면에 그릴 diff 최대 글자 수, 넘는 뒤쪽 hunk 는 생략 */
export const DETAIL_DIFF_CHARS = 20_000

/** 변경 이유 요약 요청의 제한 시간(초) */
export const REASON_TIMEOUT_SEC = 30
