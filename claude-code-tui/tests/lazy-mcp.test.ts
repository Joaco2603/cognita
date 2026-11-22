import { expect, mock, test } from 'claude-code/testing'

const pane = {
  plugin: 'cognita',
  component: 'Pane',
  requestId: 'cognita',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'Claude Code',
    isFocused: true,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 36 },
    view: {},
  },
} as const

const breakdown = {
  categories: [
    { name: 'System tools', tokens: 12000, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 7500, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 150000, color: 'promptBorder', isDeferred: false, kind: 'free' },
  ],
  totalTokens: 19500,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  autocompactSource: 'model-default',
  percentage: 9.7,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [],
  mcpTools: [
    { name: 'mcp__github__create_issue', serverName: 'github', tokens: 4000, isLoaded: true },
    { name: 'mcp__plugin_neon_neon__run_sql', serverName: 'plugin_neon_neon', tokens: 3500, isLoaded: true },
  ],
  agents: [],
  isAutoCompactEnabled: true,
  apiUsage: null,
}

function mockSession(on: any) {
  on('env.get', (_$: any, event: any) => ({ value: event.name === 'CLAUDE_INSPECTOR_STARTUP_CHECK' ? '0' : undefined }))
  on('fs.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.cwd', () => ({ value: '/workspace' }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.usage', () => ({
    value: { startedAt: 0, context: { tokens: 19500, window: 200000, percent: 9.7, breakdown }, rateLimits: [], cost: { usd: 0.1 } },
  }))
}

const start = ($: any) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
const inspector = async ($: any, args: string) => ((await $.command.run({ command: 'cognita', args })) as { text: string }).text

test('/cognita hold stores the server by key, says what it frees and refuses a repeat', async ($, on) => {
  mock.store(on)
  mockSession(on)
  await start($)
  await $.command.run({ command: 'cognita', args: 'report' })

  const text = await inspector($, 'hold PLUGIN_neon_NEON')
  expect(text).toContain('Held `plugin_neon_neon` for this project')
  expect(text).toContain('frees ~3,500 tokens')
  expect(await inspector($, 'hold github')).toContain('Held `github`')
  expect(await inspector($, 'hold github')).toContain('`github` is already held for this project.')
  expect(await inspector($, 'hold nope')).toContain('No MCP server matches `nope`. Known: github, plugin_neon_neon.')
  const list = await inspector($, 'hold')
  expect(list).toContain('`github`: from next session')
  expect(list).toContain('`plugin_neon_neon`: from next session')
})

test('/cognita release removes one server, and release all clears the list', async ($, on) => {
  mock.store(on, { 'held:/workspace': ['context7', 'github'] })
  mockSession(on)
  await start($)

  expect(await inspector($, 'release context7')).toContain('Released `context7`: it loads at every start again.')
  expect(await inspector($, 'hold')).not.toContain('context7')
  expect(await inspector($, 'release context7')).toContain('`context7` is not held for this project.')
  expect(await inspector($, 'release all')).toContain('Released `github`')
  expect(await inspector($, 'hold')).toContain('Nothing held for this project.')
})

test('/cognita hold with nothing held says so', async ($, on) => {
  mock.store(on)
  mockSession(on)
  await start($)

  expect(await inspector($, 'hold')).toContain('Nothing held for this project.')
})

test('the MCP view offers a hold button for idle servers and a section for held ones', async ($, on) => {
  mock.store(on, { 'held:/workspace': ['context7'] })
  mockSession(on)
  await start($)
  await $.command.run({ command: 'cognita', args: '' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  await ui.press({ key: 'tab-context' })
  await ui.press({ key: 'context-menu-mcp' })

  expect(await ui.find({ key: 'context-mcp-hold-github' })).toBeDefined()
  expect(await ui.find({ key: 'context-mcp-held-context7' })).toBeDefined()
  // Nothing was held back in this session, so there is nothing to connect now.
  expect(await ui.find({ key: 'context-mcp-connect-held' })).toBeUndefined()

  await ui.press({ key: 'context-mcp-hold-github' })
  expect(await inspector($, 'hold')).toContain('`github`: from next session')
})

test('a server loaded in enough sessions and never called is suggested', async ($, on) => {
  mock.store(on, { 'mcp-usage:/workspace': { sessionId: 'an-earlier-session', servers: { github: { loadedIn: 6, usedIn: 0 }, plugin_neon_neon: { loadedIn: 6, usedIn: 2 } } } })
  mockSession(on)
  await start($)

  const text = await inspector($, 'hold')
  expect(text).toContain('Suggested: `github` (loaded in 6 sessions here, never called)')
  expect(text).not.toContain('Suggested: `plugin_neon_neon`')
})

test('measuring counts a server as loaded once per session, and a call clears the suggestion', async ($, on) => {
  mock.store(on, { 'mcp-usage:/workspace': { sessionId: 'an-earlier-session', servers: { github: { loadedIn: 2, usedIn: 0 } } } })
  mockSession(on)
  on('tool.call', () => ({ result: {} }))
  await start($)
  await inspector($, 'report')
  await inspector($, 'report')
  expect(await inspector($, 'hold')).toContain('Suggested: `github` (loaded in 3 sessions here, never called)')

  await $.tool.call({ tool: 'mcp__github__create_issue', title: 'x' } as any)
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(await inspector($, 'hold')).not.toContain('Suggested')
})

test('/inspector is an alias: hold, connect and release work through it too', async ($, on) => {
  mock.store(on)
  mockSession(on)
  await start($)
  await $.command.run({ command: 'cognita', args: 'report' })

  const legacy = async (args: string) => ((await $.command.run({ command: 'inspector', args })) as { text: string }).text
  expect(await legacy('hold github')).toContain('Held `github`')
  expect(await legacy('hold')).toContain('`github`')
  expect(await legacy('release all')).toContain('Released `github`')
})
