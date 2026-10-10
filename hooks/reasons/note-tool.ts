/** 코드를 고친 Claude 가 직접 변경 이유를 남기는 도구의 정의와 입력 해석 */

/** 등록 이름, 모델은 mcp__snitch__change_note 로 부름 */
export const NOTE_TOOL = 'change_note'

export const NOTE_TOOL_SPEC = {
  name: NOTE_TOOL,
  description: [
    'snitch 대시보드에 파일을 바꾼 이유를 남기는 도구.',
    'Edit, Write, Bash 등으로 파일을 만들거나 고쳤다면 응답을 마치기 전에 한 번 호출해, 고친 파일마다 이유를 한 줄씩 적는다.',
    '이유는 무엇을 바꿨는지가 아니라 왜 바꿨는지, 30자 안팎의 명사구 (예: 로그인 실패 시 재시도 안내 추가).',
    '마침표, 가운뎃점, 화살표, 이모지는 쓰지 않는다.',
  ].join(' '),
  inputSchema: {
    type: 'object',
    properties: {
      notes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '고친 파일 경로' },
            reason: { type: 'string', description: '바꾼 이유 한 줄' },
          },
          required: ['path', 'reason'],
        },
      },
    },
    required: ['notes'],
  },
  isDeferred: false,
} as const

/** 메인 대화 시스템 프롬프트에 붙이는 안내 */
export const NOTE_PROMPT =
  '파일을 만들거나 고친 응답에서는 마치기 전에 change_note 도구로 고친 파일마다 바꾼 이유를 한 줄씩 남긴다. 사용자에게 따로 설명하지 않고 도구만 호출한다.'

export type ChangeNote = { path: string; reason: string }

/** 도구 입력에서 꺼낸 변경 메모, 형식이 맞지 않는 항목은 버림 */
export function parseNotes(input: Record<string, unknown>): ChangeNote[] {
  const notes = input['notes']
  if (!Array.isArray(notes)) return []
  return notes.flatMap(n => {
    const { path, reason } = (n ?? {}) as { path?: unknown; reason?: unknown }
    return typeof path === 'string' && path.trim() && typeof reason === 'string' && reason.trim()
      ? [{ path: path.trim(), reason }]
      : []
  })
}
