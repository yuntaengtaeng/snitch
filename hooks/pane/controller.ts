import type { Host } from '../host'

/** 대시보드 패널의 열림 상태와 열기 정책, 자동 열기는 넓은 창에서 세션당 한 번 */
export function createPaneController(deps: {
  getHost: () => Host | null
  /** 패널을 열 때 요청할 줄 수 */
  rows: () => number
  /** 기능 설정과 저장소 여부로 본 자동 열기 허용 여부 */
  allowsAutoOpen: () => boolean
}) {
  let isOpen = false
  let hasAutoOpened = false
  /** 명령 없이 연 패널도 엔진이 대화 옆에 배치하는 너비인지 여부, 좁으면 아이콘 줄 사용 */
  let isWide = false
  /** 마지막으로 그린 패널이 대화 옆 사이드바였는지 여부 */
  let isDocked = false

  return {
    isOpen: () => isOpen,
    isWide: () => isWide,
    isDocked: () => isDocked,

    /** 마지막으로 그린 패널 위치 기록 */
    sawPlacement(docked: boolean) {
      isDocked = docked
    },

    /** 마지막으로 그린 화면 너비 기록 */
    sawViewport(wide: boolean) {
      isWide = wide
    },

    reset() {
      isOpen = false
      hasAutoOpened = false
    },

    /** 넓은 창이면 세션당 한 번 열기 */
    autoOpen() {
      if (hasAutoOpened || isOpen || !isWide || !deps.allowsAutoOpen()) return
      hasAutoOpened = true
      this.openUnasked()
    },

    /** 넓은 창이고 닫혀 있으면 명령 없이 열기 */
    openUnasked() {
      const host = deps.getHost()
      if (isOpen || !isWide || !host) return
      isOpen = true
      void host.openPane(deps.rows()).catch(() => {
        isOpen = false
      })
    },

    /** 패널을 rows 줄로 다시 열고 맨 위로 스크롤 */
    show(rows = deps.rows()) {
      const host = deps.getHost()
      void host?.openPane(rows).catch(() => undefined)
      void host?.scrollPaneTop().catch(() => undefined)
    },

    /** 사용자가 누른 버튼으로 포커스를 준 채 열기, 좁은 창에서도 입력창 위에 배치 */
    openFocused() {
      const host = deps.getHost()
      if (!host) return
      isOpen = true
      void host.openPane(deps.rows(), true).catch(() => {
        isOpen = false
      })
    },

    /** 패널 닫기 */
    close() {
      isOpen = false
      void deps.getHost()?.closePane().catch(() => undefined)
    },

    /** 패널 안 요소로 포커스 이동 */
    focus(key: string) {
      void deps.getHost()?.focusPane(key).catch(() => undefined)
    },

    /** 보이는 패널이면 닫고 아니면 열기, 결과 반환 */
    async toggle(): Promise<'opened' | 'closed'> {
      const host = deps.getHost()
      if (!host) return 'closed'
      const pane = await host.paneState().catch(() => null)
      if (pane?.isOpen && pane.isPlaced && pane.isShown) {
        await host.closePane().catch(() => undefined)
        isOpen = false
        return 'closed'
      }
      await host.openPane(deps.rows())
      isOpen = true
      return 'opened'
    },

    /** 엔진이나 사용자가 패널을 닫았을 때 */
    closed() {
      isOpen = false
    },
  }
}
