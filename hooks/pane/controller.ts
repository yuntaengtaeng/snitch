import type { Host } from '../host'

/** 창이 좁아 명령 없이 연 패널이 대기 중일 때의 안내 */
export const PANE_WAITING_TOAST = '창이 좁아 snitch 패널 대기 중, /snitch 로 입력창 위에 열기'

/** 대시보드 패널의 열림 상태와 열기 정책, 자동 열기는 세션당 한 번 */
export function createPaneController(deps: {
  getHost: () => Host | null
  /** 패널을 열 때 요청할 줄 수 */
  rows: () => number
  /** 기능 설정과 저장소 여부로 본 자동 열기 허용 여부 */
  allowsAutoOpen: () => boolean
}) {
  let isOpen = false
  let hasAutoOpened = false

  /** 명령 없이 패널 열기, 엔진이 배치하지 않으면 여는 방법 안내 */
  async function openOrHint(host: Host) {
    isOpen = true
    const opened = await host.openPane(deps.rows()).catch(() => null)
    if (opened === null) isOpen = false
    else if (!opened.isPlaced) host.toast(PANE_WAITING_TOAST)
  }

  return {
    isOpen: () => isOpen,

    /** 열려 있을 때만 다시 그리기 */
    redraw() {
      if (isOpen) deps.getHost()?.invalidate()
    },

    reset() {
      isOpen = false
      hasAutoOpened = false
    },

    /** 전체화면 레이아웃이면 세션당 한 번 열기 */
    autoOpen(isFullscreen: boolean) {
      const host = deps.getHost()
      if (hasAutoOpened || isOpen || !isFullscreen || !host || !deps.allowsAutoOpen()) return
      hasAutoOpened = true
      void openOrHint(host)
    },

    /** 닫혀 있으면 명령 없이 열기 */
    openUnasked() {
      const host = deps.getHost()
      if (isOpen || !host) return
      void openOrHint(host)
    },

    /** 패널을 rows 줄로 다시 열고 맨 위로 스크롤 */
    show(rows = deps.rows()) {
      const host = deps.getHost()
      void host?.openPane(rows).catch(() => undefined)
      void host?.scrollPaneTop().catch(() => undefined)
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
