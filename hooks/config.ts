/**
 * 팀에서 조정할 설정값. 기능을 끄려면 ENABLE 의 값을 false 로 바꾸세요.
 */

export const ENABLE = {
  /** 상태줄: 요금제 한도 · 오늘 누적 비용 · 세션 작업량 */
  statusLine: true,
  /** 상태줄 맨 앞에 지금 쓰는 모델 · effort 표시 (statusLine 이 켜져 있을 때) */
  modelEffort: true,
  /** /changes 작업 파일 패널 */
  workFiles: true,
}

// ───────────── 작업 파일 패널 ─────────────

/** 패널 id 와 커맨드 이름 */
export const PANE_ID = 'k-work-files'
export const PANE_TITLE = '작업 파일'
export const CHANGES_COMMAND = 'changes'

/** Claude가 파일을 편집했다고 볼 툴 */
export const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] as const

/**
 * 전체화면 레이아웃에서 세션이 시작되면 패널을 우측에 자동으로 띄울지.
 * (일반 화면 모드에서는 입력창 위를 차지하므로 자동으로 열지 않는다)
 * 자동으로 연 패널은 터미널이 144칸 이상일 때만 그려지고, 좁으면 숨어 있다가 /changes 로 나타난다.
 */
export const PANE_AUTO_OPEN = true

/** 우측에 붙을 때 요청할 너비 (사용자가 경계를 끌어 바꾸면 그 값이 우선) */
export const PANE_DOCK_COLUMNS = 56

/** 전체화면 레이아웃에서 패널을 붙일 수 있는 최소 너비. 이보다 좁으면 텍스트로 보여준다 */
export const PANE_MIN_COLUMNS = 110

/**
 * 다른 세션이 같은 파일을 수정했다고 볼 시간(분).
 * 이보다 오래된 기록은 끝난 세션으로 보고 무시한다.
 */
export const CONFLICT_TTL_MIN = 30

/** 패널이 열려 있을 때 다른 세션의 수정 기록을 다시 확인하는 주기(초) */
export const CONFLICT_POLL_SEC = 20

/**
 * 패널 배경색. null 이면 터미널·앱 테마를 그대로 따른다 (권장).
 * 고정하려면 '#1e1e1e' 같은 색을 넣는다. 밝은 테마에서는 패널만 어둡게 보이게 된다.
 */
export const PANE_BACKGROUND: string | null = null

// ───────────── 상태줄 ─────────────

/** 오늘 비용을 며칠치까지 저장해 둘지 (오래된 기록은 자동 삭제) */
export const COST_KEEP_DAYS = 7
