/** 대시보드 패널의 지금 화면과 접힘 상태 */

/** home 은 칸과 변경 파일, files 는 아이콘 줄에서 연 변경 파일만 */
export type Screen = 'home' | 'files' | 'todos' | 'decisions' | 'agents' | 'links'

export type NavigationView = {
  screen: Screen
  /** 사이드바를 닫고 입력창 위 아이콘 줄로 접힌 상태 */
  isFolded: boolean
  /** 아이콘 줄로 바로 연 화면, 머리줄에 제목만 표시 */
  isDirect: boolean
  /** 좁은 창의 아이콘 줄로 잠깐 연 화면, Esc 나 다음 요청 때 닫음 */
  isQuick: boolean
}

/** Esc 를 눌렀을 때 할 일 */
export type BackAction = 'home' | 'fold' | 'close'

export const HOME: NavigationView = { screen: 'home', isFolded: false, isDirect: false, isQuick: false }

/** Esc 의 동작, 잠깐 연 화면은 닫고 접힌 줄에서 연 화면은 다시 접고 다른 화면은 홈으로, 홈이면 닫기 */
export function backAction(view: NavigationView): BackAction {
  if (view.isQuick) return 'close'
  if (view.isDirect) return 'fold'
  if (view.screen !== 'home') return 'home'
  return 'close'
}

/** 패널이 닫힐 때 할 일, 파일 상세면 목록으로, 사이드바를 사용자가 닫으면 아이콘 줄로 접기 */
export type CloseOutcome = 'back-to-list' | 'home' | 'fold' | 'close'

export function closeOutcome(
  view: NavigationView,
  state: { isPerson: boolean; isDetailOpen: boolean; isDocked: boolean },
): CloseOutcome {
  if (!state.isPerson) return 'close'
  if (state.isDetailOpen) return 'back-to-list'
  const action = backAction(view)
  if (action === 'close' && state.isDocked) return 'fold'
  return action
}

/** 입력창 위 아이콘 줄의 종류, 접혔으면 홈 포함, 좁은 창이면 화면 아이콘만, 패널이 열렸거나 설문이 있으면 없음 */
export type QuickBarMode = 'none' | 'folded' | 'narrow'

export function quickBarMode(state: {
  hasRepo: boolean
  hasSurvey: boolean
  isPaneOpen: boolean
  isFolded: boolean
  isWide: boolean
}): QuickBarMode {
  if (!state.hasRepo || state.hasSurvey || state.isPaneOpen) return 'none'
  if (state.isFolded) return 'folded'
  return state.isWide ? 'none' : 'narrow'
}

/** 접힌 줄에서 아이콘을 누른 뒤의 상태, 홈은 그냥 펼침 */
export function unfoldTo(screen: Screen): NavigationView {
  return { screen, isFolded: false, isDirect: screen !== 'home', isQuick: false }
}

/** 화면 이동과 접기 상태, 바뀌면 이전 상태와 함께 알림 */
export function createNavigation(deps: { onChange: (next: NavigationView, prev: NavigationView) => void }) {
  let view: NavigationView = HOME

  function set(next: NavigationView) {
    const prev = view
    view = next
    deps.onChange(next, prev)
  }

  return {
    view: () => view,
    go: (screen: Screen) => set({ ...view, screen }),
    unfold: (screen: Screen) => set(unfoldTo(screen)),
    fold: () => set({ screen: 'home', isFolded: true, isDirect: false, isQuick: false }),
    /** 좁은 창의 아이콘 줄로 그 화면만 잠깐 열기 */
    quick: (screen: Screen) => set({ screen, isFolded: false, isDirect: true, isQuick: true }),
    home: () => set(HOME),
    reset() {
      view = HOME
    },
  }
}
