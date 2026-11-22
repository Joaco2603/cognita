// Unit tests for `/cognita trim --apply`, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import { applyTrim, wantsApply } from '../hooks/trim.js'

const levers = [
  { key: 'file:CLAUDE.md', text: 'Trim CLAUDE.md', tokens: 28700, kind: 'file', target: '/home/me/.claude/CLAUDE.md' },
  { key: 'plugin:cloudflare', text: 'Disable plugin cloudflare', tokens: 829, kind: 'plugin', target: 'cloudflare' },
  { key: 'mcp:docs', text: 'Hold MCP server docs', tokens: 586, kind: 'mcp', target: 'docs' },
  { key: 'plugin:vercel', text: 'Disable plugin vercel', tokens: 480, kind: 'plugin', target: 'vercel' },
]

function fakeIo({ failing = [] } = {}) {
  const calls = { run: [], hold: [] }
  return {
    calls,
    io: {
      run: async (argv) => {
        calls.run.push(argv)
        return failing.includes(argv[3]) ? { exitCode: 1, stderr: 'not installed' } : { exitCode: 0, stderr: '' }
      },
      hold: async (server) => {
        calls.hold.push(server)
        return `Held ${server}.`
      },
    },
  }
}

test('--apply is recognised with or without the dashes', () => {
  assert.equal(wantsApply(new Set(['--apply'])), true)
  assert.equal(wantsApply(new Set(['apply'])), true)
  assert.equal(wantsApply(new Set(['', 'json'])), false)
})

test('apply disables each plugin by argument vector, holds each MCP server, and leaves files to the user', async () => {
  const { io, calls } = fakeIo()
  const text = await applyTrim(levers, io)
  assert.deepEqual(calls.run, [
    ['claude', 'plugin', 'disable', 'cloudflare', '--scope', 'local'],
    ['claude', 'plugin', 'disable', 'vercel', '--scope', 'local'],
  ])
  assert.deepEqual(calls.hold, ['docs'])
  assert.ok(text.startsWith('## Trim applied'))
  assert.ok(text.includes('claude plugin enable cloudflare --scope local'))
  assert.ok(text.includes('/cognita connect docs'))
  assert.ok(text.includes('/home/me/.claude/CLAUDE.md'))
  assert.ok(text.includes('by hand'))
  // Only what was actually applied counts as freed: 829 + 586 + 480.
  assert.ok(text.includes('~1,895 tokens'))
})

test('a plugin that fails to disable is reported and not counted as freed', async () => {
  const { io } = fakeIo({ failing: ['cloudflare'] })
  const text = await applyTrim(levers, io)
  assert.ok(text.includes('cloudflare'))
  assert.ok(text.includes('not installed'))
  assert.ok(text.includes('~1,066 tokens'))
})

test('a plugin name that could pass as a flag is refused and never run', async () => {
  const { io, calls } = fakeIo()
  const text = await applyTrim([{ key: 'p', text: 'x', tokens: 100, kind: 'plugin', target: '--all' }], io)
  assert.deepEqual(calls.run, [])
  assert.ok(text.includes('refused'))
})

test('nothing to apply says so and runs nothing', async () => {
  const { io, calls } = fakeIo()
  const text = await applyTrim([], io)
  assert.ok(text.includes('Nothing to apply'))
  assert.deepEqual(calls.run, [])
  assert.deepEqual(calls.hold, [])
})

test('a throwing command is reported as a failed step and the rest still run', async () => {
  const calls = []
  const io = {
    run: async (argv) => {
      calls.push(argv[3])
      if (argv[3] === 'cloudflare') throw new Error('spawn failed')
      return { exitCode: 0, stderr: '' }
    },
    hold: async () => 'Held.',
  }
  const text = await applyTrim(levers, io)
  assert.deepEqual(calls, ['cloudflare', 'vercel'])
  assert.ok(text.includes('spawn failed'))
})
