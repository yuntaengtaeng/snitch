import type { Elements } from 'claude-code'

import type { Screen } from './navigation'
import { HOME_ICON, SCREEN_ICONS, SCREEN_TITLE, type ListScreen } from './screens'

export type QuickBarUi = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Button'>

/** 입력창 위 오른쪽 끝 아이콘 한 줄, withHome 이면 맨 앞에 홈, withLabels 면 화면 이름까지 */
export function renderQuickBar(
  ui: QuickBarUi,
  counts: Record<ListScreen, string>,
  open: (screen: Screen) => void,
  options: { withHome: boolean; withLabels: boolean },
) {
  const { withHome, withLabels } = options
  const { Box, Text, Button } = ui
  return (
    <Box flexDirection="row" justifyContent="flex-end" columnGap={2}>
      {withHome ? (
        <Button key="quick-home" label="홈" plain onPress={() => open('home')}>
          <Text bold>{HOME_ICON}</Text>
          <Text color="inactive">{withLabels ? ' 홈' : ''}</Text>
        </Button>
      ) : (
        <Text key="quick-no-home" />
      )}
      {SCREEN_ICONS.map(({ screen, icon }) => {
        const isHot = screen === 'decisions' && counts.decisions !== '0'
        return (
          <Button key={`quick-${screen}`} label={SCREEN_TITLE[screen]} plain onPress={() => open(screen)}>
            <Text bold color={isHot ? 'warning' : undefined}>
              {icon}
            </Text>
            <Text color={isHot ? 'warning' : 'inactive'}>
              {withLabels ? ` ${SCREEN_TITLE[screen]} ${counts[screen]}` : ` ${counts[screen]}`}
            </Text>
          </Button>
        )
      })}
    </Box>
  )
}
