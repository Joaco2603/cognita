import { expect, mock, test } from 'claude-code/testing'

type Usage = { usd: number; hasUnknownPrice?: true }

function mockSession(on: any, cost: Usage, env: Record<string, string> = {}) {
  on('env.get', (_$: any, event: any) => ({ value: { CLAUDE_INSPECTOR_STARTUP_CHECK: '0', ...env }[event.name] }))
  on('fs.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 20000, window: 200000, percent: 10 }, rateLimits: [], cost } }))
}

async function start($: any) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
}

async function cognita($: any, args: string): Promise<string> {
  const { text } = await $.command.run({ command: 'cognita', args }) as { text: string }
  return text
}

test('a cost with an unknown price is shown as a lower bound, never as the exact spend', async ($, on) => {
  mock.store(on)
  mockSession(on, { usd: 0.8, hasUnknownPrice: true })
  await start($)

  const text = await cognita($, 'cost')
  expect(text).toContain('This session so far: at least $0.80')
  expect(text).toContain('Total: at least $0.80')
  const json = JSON.parse((await cognita($, 'cost json')).replace(/^```json\n|\n```$/g, ''))
  expect(json.isPartial).toBe(true)
})
