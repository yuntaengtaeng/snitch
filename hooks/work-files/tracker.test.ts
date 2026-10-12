import { expect, test } from 'claude-code/testing'

import type { Host } from '../host'
import { createWorkFiles } from './tracker'

type GitResult = { exitCode: number; stdout: string; stderr: string }

/** 편집한 파일 기록, 편집 직후의 비동기 갱신은 이어지는 refresh 와 합쳐짐 */
function track(workFiles: ReturnType<typeof createWorkFiles>, paths: string[]) {
  for (const p of paths) workFiles.track(p, 'main')
}

/** git 명령별 응답을 바꿔 끼울 수 있는 작업 파일 tracker */
async function setup() {
  const ok = (stdout: string): GitResult => ({ exitCode: 0, stdout, stderr: '' })
  const answers = { numstat: ok(''), untracked: ok('') }
  const cleaned: string[][] = []
  const host = {
    run: async (argv: string[]) => {
      if (argv.includes('--show-toplevel')) return ok('/repo\n')
      if (argv.includes('rev-parse')) return ok('abc1234\n')
      if (argv.includes('--numstat')) return answers.numstat
      if (argv.includes('ls-files')) return answers.untracked
      return ok('')
    },
    readFile: async () => '',
    storeKeys: async () => [],
    storeGet: async () => undefined,
    storeSet: async () => undefined,
    storeDelete: async () => undefined,
    now: async () => 0,
  } as unknown as Host
  const workFiles = createWorkFiles({
    getHost: () => host,
    onChange: () => undefined,
    onCleaned: paths => cleaned.push(paths),
  })
  await workFiles.start('/repo', 'sid')
  return { workFiles, answers, cleaned, ok }
}

test('git 이 실패하면 이전 변경 파일 목록을 그대로 둔다', async () => {
  const { workFiles, answers, cleaned, ok } = await setup()
  answers.numstat = ok('3\t1\ta.ts\n2\t0\tb.ts\n')
  track(workFiles, ['a.ts', 'b.ts'])
  await workFiles.refresh()
  expect(workFiles.view().current.map(f => f.path)).toEqual(['a.ts', 'b.ts'])

  answers.numstat = { exitCode: 128, stdout: '', stderr: 'index.lock' }
  await workFiles.refresh()

  expect(workFiles.view().current.map(f => f.path)).toEqual(['a.ts', 'b.ts'])
  expect(cleaned).toEqual([])
})

test('커밋이나 되돌리기로 HEAD 와 같아진 파일만 추적에서 빠진다', async () => {
  const { workFiles, answers, cleaned, ok } = await setup()
  answers.numstat = ok('3\t1\ta.ts\n2\t0\tb.ts\n')
  track(workFiles, ['a.ts', 'b.ts'])
  await workFiles.refresh()

  answers.numstat = ok('2\t0\tb.ts\n')
  await workFiles.refresh()

  expect(workFiles.view().current.map(f => f.path)).toEqual(['b.ts'])
  expect(cleaned).toEqual([['a.ts']])
})

test('새 파일은 git 이 추적하지 않아도 변경 파일로 남는다', async () => {
  const { workFiles, answers, cleaned, ok } = await setup()
  answers.untracked = ok('new.ts\n')
  track(workFiles, ['new.ts'])
  await workFiles.refresh()

  expect(workFiles.view().current).toEqual([{ path: 'new.ts', added: 0, deleted: 0, isNew: true }])
  expect(cleaned).toEqual([])
})
