/** Claude 가 기억할 거리 보드를 고치는 도구의 정의와 안내 */

/** 등록 이름, 모델은 mcp__snitch__board 로 부름 */
export const BOARD_TOOL = 'board'

export const BOARD_TOOL_SPEC = {
  name: BOARD_TOOL,
  description: [
    '사용자 화면 옆 snitch 패널에 이 세션의 할 일과 사용자가 정해야 할 결정을 남기는 도구.',
    '사용자에게 답을 받아야 끝나는 질문은 작업 크기와 상관없이 답변 끝에만 두지 말고 open_decisions 로 남긴다.',
    '고를 수 있는 답이 정해져 있으면 options 에 2~4개를 짧게 넣는다, 사용자가 버튼으로 바로 고른다.',
    '사용자가 "[결정 d1] 질문: 답" 형식으로 답하면 그 답대로 진행하고 decide 에 id 를 넣어 닫는다.',
    '작업이 3단계 이상이거나 새 지시가 오면 답변에 할 일 목록을 쓰는 대신 add_todos 를 쓴다, 항목 하나에 행동 하나.',
    'start_todo: 지금 하는 할 일 id, 진행 중은 한 번에 하나. done_todos, remove_todos: 할 일 id.',
    '바로바로 갱신하고 몰아서 완료하지 않는다. 확인까지 실제로 끝난 뒤에만 완료로 표시한다.',
    '막히면 진행 중으로 두고 막힌 이유를 새 할 일로 추가한다.',
    '지금 보드와 id 는 시스템 프롬프트 끝에 있다.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      add_todos: { type: 'array', items: { type: 'string' } },
      start_todo: { type: 'string' },
      done_todos: { type: 'array', items: { type: 'string' } },
      remove_todos: { type: 'array', items: { type: 'string' } },
      open_decisions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string', description: '사용자가 정할 질문 한 줄' },
            options: { type: 'array', items: { type: 'string' }, description: '고를 수 있는 답 2~4개, 없으면 생략' },
          },
          required: ['question'],
        },
      },
      decide: { type: 'array', items: { type: 'string' }, description: '사용자가 답한 결정 id' },
    },
  },
}

/** 질문으로 끝난 응답을 결정으로 남기게 한 번 돌려보낼 때의 안내 */
export const NUDGE =
  '답변이 사용자에게 묻는 질문으로 끝났지만 snitch 보드에 열린 결정이 없다. ' +
  'mcp__snitch__board 의 open_decisions 로 그 질문을 남기고 (답이 정해져 있으면 options 포함) 턴을 끝낸다. ' +
  '답이 필요 없는 수사적 질문이면 그대로 턴을 끝낸다.'
