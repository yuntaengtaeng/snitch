import type { On } from 'claude-code'

/** 시스템 프롬프트 끝에 붙일 구역, 제공된 도구 이름을 보고 붙일지 정함, 붙이지 않으면 null */
export type PromptSection = (tools: readonly string[]) => { id: string; text: string } | null

/** 기능들이 내놓은 구역을 시스템 프롬프트 끝에 한 번에 추가 */
export function registerPromptHooks(on: On, sections: readonly PromptSection[]) {
  on('prompt.compose', async ($, e, next) => {
    const r = await next(e)
    const added = sections.flatMap(section => {
      const s = section(e.tools)
      return s === null ? [] : [{ ...s, scope: 'session' as const }]
    })
    return { sections: [...r.sections, ...added] }
  })
}
