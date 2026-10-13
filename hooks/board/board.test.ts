import { expect, test } from 'claude-code/testing'

import {
  addLinks,
  answerText,
  applyUpdate,
  asksUser,
  describeBoard,
  EMPTY_BOARD,
  makesSomething,
  markAnswered,
  MAX_LINKS,
  parseUpdate,
  updateSummary,
  urlPins,
} from './board'
import { boardStatusParts, boardText, progressBar } from './view'

test('applyUpdate: 할 일을 추가하고 진행 중은 하나만 둔다', () => {
  let board = applyUpdate(EMPTY_BOARD, { add_todos: ['README 작성', 'PR 열기'] })
  board = applyUpdate(board, { start_todo: 't1' })
  board = applyUpdate(board, { start_todo: 't2', done_todos: ['t1'] })
  expect(board.todos.map(t => [t.id, t.state])).toEqual([
    ['t1', 'done'],
    ['t2', 'active'],
  ])
})

test('applyUpdate: 지운 번호를 다시 쓰지 않고 이어서 매긴다', () => {
  let board = applyUpdate(EMPTY_BOARD, { add_todos: ['a', 'b'] })
  board = applyUpdate(board, { remove_todos: ['t1'], add_todos: ['c'] })
  expect(board.todos.map(t => t.id)).toEqual(['t2', 't3'])
})

test('applyUpdate: 결정은 선택지를 4개까지 받고 decide 로 닫는다', () => {
  let board = applyUpdate(EMPTY_BOARD, {
    open_decisions: [{ question: '라이선스', options: ['MIT', 'Apache-2.0', 'BSD', 'GPL', 'LGPL'] }],
  })
  expect(board.decisions[0]?.options).toEqual(['MIT', 'Apache-2.0', 'BSD', 'GPL'])
  board = applyUpdate(board, { decide: ['d1'] })
  expect(board.decisions).toEqual([])
})

test('parseUpdate: 문자열 결정과 잘못된 값을 정리한다', () => {
  expect(parseUpdate({ open_decisions: ['  배포할까  ', { question: '' }, { question: '이름', options: ['a', 3] }] })).toMatchObject({
    open_decisions: [{ question: '배포할까' }, { question: '이름', options: ['a'] }],
  })
  expect(parseUpdate({ add_todos: 'x', start_todo: 5 })).toMatchObject({ add_todos: undefined, start_todo: undefined })
})

test('결정에 답하면 id 를 붙인 요청과 보드 표시가 남는다', () => {
  const board = applyUpdate(EMPTY_BOARD, { open_decisions: [{ question: '라이선스를 무엇으로 할까' }] })
  const decision = board.decisions[0]
  if (!decision) throw new Error('결정 없음')
  expect(answerText(decision, ' MIT ')).toBe('[결정 d1] 라이선스를 무엇으로 할까: MIT')
  expect(describeBoard(markAnswered(board, 'd1', 'MIT'))).toBe('snitch 보드:\nd1 [?] 라이선스를 무엇으로 할까 (사용자 답: MIT)')
})

test('asksUser: 마지막 줄들이 물음표로 끝나면 질문으로 본다, 코드 블록 제외', () => {
  expect(asksUser('정리했습니다.\n\n이 방향으로 진행할까요?')).toBe(true)
  expect(asksUser('끝났습니다.\n```\nwhy?\n```')).toBe(false)
  expect(asksUser('**진행할까요?**')).toBe(true)
})

test('makesSomething: 만드는 명령과 아티팩트 게시만 링크 대상', () => {
  expect(makesSomething('Bash', { command: 'gh pr create --fill' })).toBe(true)
  expect(makesSomething('Bash', { command: 'git push origin main' })).toBe(true)
  expect(makesSomething('Bash', { command: 'curl https://example.com' })).toBe(false)
  expect(makesSomething('Artifact', { file_path: 'a.html' })).toBe(true)
  expect(makesSomething('Artifact', { action: 'read', url: 'x' })).toBe(false)
  expect(makesSomething('mcp__slack__send_message', {})).toBe(true)
  expect(makesSomething('WebFetch', {})).toBe(false)
  expect(makesSomething('Bash', { command: 'npx vercel deploy' })).toBe(true)
  expect(makesSomething('Bash', { command: 'vercel env ls' })).toBe(false)
  expect(makesSomething('Bash', { command: 'npx wrangler pages deploy dist' })).toBe(true)
  expect(makesSomething('mcp__claude_ai_Claude_Docs__batch', { container: { kind: 'project', create: {} } })).toBe(true)
  expect(makesSomething('mcp__claude_ai_Claude_Docs__batch', { container: { kind: 'project', id: 'x' } })).toBe(false)
})

test('urlPins: 끝 문장부호를 떼고 GitHub 와 아티팩트는 짧은 이름', () => {
  expect(urlPins('PR: https://github.com/a/snitch/pull/12. 시안 https://claude.ai/artifact/FmEzg5VnBKYAAdUjTfQpJg)')).toEqual([
    { href: 'https://github.com/a/snitch/pull/12', label: 'snitch PR #12' },
    { href: 'https://claude.ai/artifact/FmEzg5VnBKYAAdUjTfQpJg', label: '아티팩트 FmEzg5Vn' },
  ])
})

test('urlPins: git push 출력에서 원격 주소는 빼고 PR 만들기 주소만 남긴다', () => {
  const pushOutput = [
    'remote: Create a pull request for \'cart\' on GitHub by visiting:',
    'remote:      https://github.com/a/snitch/pull/new/cart',
    'To https://github.com/a/snitch.git',
  ].join('\n')
  expect(urlPins(pushOutput).map(p => p.href)).toEqual(['https://github.com/a/snitch/pull/new/cart'])
})

test('addLinks: 새 링크가 앞에 오고 같은 주소는 하나만, 최대 개수 유지', () => {
  let board = EMPTY_BOARD
  for (let i = 0; i < MAX_LINKS + 2; i++) board = addLinks(board, [{ href: `https://x.dev/${i}`, label: `${i}` }])
  board = addLinks(board, [{ href: 'https://x.dev/5', label: '5' }])
  expect(board.links.length).toBe(MAX_LINKS)
  expect(board.links[0]?.href).toBe('https://x.dev/5')
})

test('updateSummary 와 보드 텍스트', () => {
  expect(updateSummary({ add_todos: ['a', 'b'], decide: ['d1'] })).toBe('snitch 보드: 할 일 +2, 결정 1개 닫음')
  const board = applyUpdate(EMPTY_BOARD, { add_todos: ['a', 'b'], start_todo: 't2', open_decisions: [{ question: 'q', options: ['예', '아니요'] }] })
  expect(boardText(board)).toBe(['결정 필요 1', '  ? q', '    선택지: 예, 아니요', '', '할 일 0/2', '  ▸ b', '  ○ a'].join('\n'))
  expect(progressBar(1, 4, 4)).toBe('▰▱▱▱')
})


test('boardStatusParts: 할 일 진행률과 답하지 않은 결정 수만 보여 준다', () => {
  let board = applyUpdate(EMPTY_BOARD, { add_todos: ['a', 'b', 'c'], open_decisions: [{ question: 'A?' }, { question: 'B?' }] })
  board = applyUpdate(board, { done_todos: ['t1'] })
  expect(boardStatusParts(board)).toEqual(['할 일 1/3', '결정 2개'])
  expect(boardStatusParts(markAnswered(markAnswered(board, 'd1', '예'), 'd2', '예'))).toEqual(['할 일 1/3'])
  expect(boardStatusParts(EMPTY_BOARD)).toEqual([])
})
