import { expect, mock, test } from 'claude-code/testing'

const pane = {
  plugin: 'cognita',
  component: 'Pane',
  requestId: 'cognita',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'Cognita',
    isFocused: true,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 36 },
    view: {},
  },
} as const

const breakdown = {
  categories: [
    { name: 'System prompt', tokens: 3000, color: 'promptBorder', isDeferred: false, kind: 'used' },
    { name: 'System tools', tokens: 12000, color: 'inactive', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 9000, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
    { name: 'Memory files', tokens: 2500, color: 'claude', isDeferred: false, kind: 'used' },
    { name: 'Skills', tokens: 900, color: 'warning', isDeferred: false, kind: 'used' },
    { name: 'Messages', tokens: 4000, color: 'purple_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' },
    { name: 'Free space', tokens: 135600, color: 'promptBorder', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 33000, color: 'inactive', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 31400,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  autocompactSource: 'model-default',
  percentage: 15.7,
  gridRows: [],
  model: 'claude-opus-5-5',
  memoryFiles: [
    { path: '/workspace/CLAUDE.md', type: 'Project', tokens: 1800 },
    { path: '/home/user/.claude/CLAUDE.md', type: 'User', tokens: 700 },
  ],
  mcpTools: [
    { name: 'mcp__github__create_issue', serverName: 'github', tokens: 4000, isLoaded: true },
    { name: 'mcp__github__list_prs', serverName: 'github', tokens: 2000, isLoaded: true },
    { name: 'mcp__linear__search', serverName: 'linear', tokens: 3000, isLoaded: true },
    { name: 'mcp__linear__create', serverName: 'linear', tokens: 1500, isLoaded: false },
  ],
  agents: [{ agentType: 'reviewer', source: 'projectSettings', tokens: 120 }],
  slashCommands: { totalCommands: 30, includedCommands: 28, tokens: 400 },
  skills: {
    totalSkills: 2,
    includedSkills: 2,
    tokens: 900,
    skillFrontmatter: [
      { name: 'commit', source: 'userSettings', tokens: 500 },
      { name: 'deploy', source: 'plugin', pluginName: 'ops', tokens: 400 },
    ],
  },
  isAutoCompactEnabled: true,
  apiUsage: null,
}

function mockSession(on: any, requested: string[] = [], opened?: string[], env: Record<string, string> = {}) {
  on('env.get', (_$: any, event: any) => ({ value: env[event.name] }))
  on('fs.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', (_$: any, event: any) => {
    opened?.push(event.id)
    return { value: { isPlaced: true } }
  })
  on('session.usage', (_$: any, event: any) => {
    requested.push(event.breakdown)
    return {
      value: {
        startedAt: 0,
        context: { tokens: 31400, window: 200000, percent: 15.7, breakdown },
        rateLimits: [],
        cost: { usd: 0.42 },
      },
    }
  })
}

async function openContext($: any, on: any, requested?: string[]) {
  mockSession(on, requested)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  await $.command.run({ command: 'cognita', args: '' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  await ui.press({ key: 'tab-context' })
  return ui
}

test('the Context tab measures the window and shows what fills it', async ($, on) => {
  const requested: string[] = []
  const ui = await openContext($, on, requested)

  expect(requested).toEqual(['summary'])
  expect(await ui.find({ key: 'context-meter' })).toBeDefined()
  expect(await ui.find({ key: 'context-category-system-tools' })).toBeDefined()
  expect(await ui.find({ key: 'context-category-free-space' })).toBeUndefined()
  expect(await ui.find({ text: 'claude-opus-5-5' })).toBeDefined()
})

test('the Context tab suggests the biggest levers and groups skills by source', async ($, on) => {
  const ui = await openContext($, on)

  expect(await ui.find({ key: 'context-lever-mcp-linear' })).toBeDefined()
  expect(await ui.find({ key: 'context-lever-skills-plugin-ops' })).toBeDefined()

  await ui.press({ key: 'context-menu-skills' })
  expect(await ui.find({ key: 'context-skill-source-plugin-ops' })).toBeDefined()
  expect(await ui.find({ key: 'context-skill-source-usersettings' })).toBeDefined()
})

test('the Context tab flags loaded MCP servers and skills the session never used', async ($, on) => {
  mockSession(on)
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  await $.tool.call({ tool: 'mcp__github__create_issue', title: 'x' } as any)
  await $.command.run({ command: 'cognita', args: '' })
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  await ui.press({ key: 'tab-context' })

  expect(await ui.find({ key: 'context-idle-mcp-linear' })).toBeDefined()
  expect(await ui.find({ key: 'context-idle-mcp-github' })).toBeUndefined()
  expect(await ui.find({ key: 'context-idle-skill-commit' })).toBeDefined()

  await ui.press({ key: 'context-menu-mcp' })
  expect(await ui.find({ key: 'context-mcp-github' })).toBeDefined()
  expect(await ui.find({ text: 'github  2/2 · 1 calls' })).toBeDefined()
  expect(await ui.find({ text: 'linear  1/2 · 0 calls' })).toBeDefined()
})

test('the Context tab lists instruction files, skills and custom agents', async ($, on) => {
  const ui = await openContext($, on)

  await ui.press({ key: 'context-menu-memory' })
  expect(await ui.find({ key: 'context-file-workspace-claude-md' })).toBeDefined()
  expect(await ui.find({ key: 'context-file-home-user-claude-claude-md' })).toBeDefined()

  await ui.press({ key: 'context-menu-skills' })
  expect(await ui.find({ key: 'context-skill-deploy' })).toBeDefined()
  expect(await ui.find({ key: 'context-agent-reviewer' })).toBeDefined()
  expect(await ui.find({ text: 'Slash commands: 28/30 listed · 400 tokens' })).toBeDefined()
})

test('Exact count asks Claude Code for a full breakdown', async ($, on) => {
  const requested: string[] = []
  const ui = await openContext($, on, requested)

  await ui.press({ key: 'context-refresh-full' })
  expect(requested).toEqual(['summary', 'full'])
  expect(await ui.find({ key: 'context-meter' })).toBeDefined()
})

test('the Prompt view explains when no system prompt has been captured yet', async ($, on) => {
  const ui = await openContext($, on)

  await ui.press({ key: 'context-menu-prompt' })
  expect(await ui.find({ text: 'SYSTEM PROMPT SECTIONS' })).toBeDefined()
})

test('/cognita report prints a markdown loadout without opening the pane', async ($, on) => {
  const opened: string[] = []
  mockSession(on, [], opened)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'report' }) as { text: string }

  expect(opened).toEqual([])
  expect(text).toContain('## Session loadout')
  expect(text).toContain('| github | 2 / 2 | 6,000 | 0 |')
  expect(text).toContain('| /workspace/CLAUDE.md | Project | 1,800 |')
  expect(text).toContain('MCP server `linear`')
})

test('/cognita help lists the subcommands', async ($, on) => {
  mockSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'inspector', args: 'help' }) as { text: string }
  expect(text).toContain('/cognita report')
})

const lastSession = {
  'history:/workspace': {
    current: {
      shape: 'loadout-1',
      sessionId: 'an-earlier-session',
      at: '2026-11-20T09:30:00.000Z',
      model: 'claude-opus-5-5',
      baseTokens: 24000,
      items: {
        'category:System tools': 12000,
        'category:MCP tools': 6000,
        'mcp:github': 6000,
        'mcp:slack': 2500,
        'skills:userSettings': 500,
        'skills:plugin ops': 400,
        'file:/workspace/CLAUDE.md': 1800,
      },
    },
  },
}

test('the Context tab compares the loadout with the last session in this project', async ($, on) => {
  mock.store(on, lastSession)
  const ui = await openContext($, on)

  expect(await ui.find({ key: 'context-since-total' })).toBeDefined()
  expect(await ui.find({ key: 'context-change-mcp-linear' })).toBeDefined()
  expect(await ui.find({ key: 'context-change-mcp-slack' })).toBeDefined()
  expect(await ui.find({ key: 'context-change-category-mcp-tools' })).toBeDefined()
  expect(await ui.find({ key: 'context-change-mcp-github' })).toBeUndefined()
})

test('/cognita report says what changed since the last session, or that it is the first', async ($, on) => {
  mock.store(on, lastSession)
  mockSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'report' }) as { text: string }
  expect(text).toContain('### Since last session')
  expect(text).toContain('MCP server linear: added, 3,000 tokens')
  expect(text).toContain('MCP server slack: removed, was 2,500 tokens')
  expect(text).toContain('since 2026-11-20 09:30 UTC')
})

test('the first measurement in a project says the next session will be compared', async ($, on) => {
  mock.store(on)
  const ui = await openContext($, on)

  expect(await ui.find({ key: 'context-since-first' })).toBeDefined()
})

test('a session start measures in the background and warns when the loadout grew', async ($, on) => {
  const toasts: string[] = []
  mock.store(on, lastSession)
  mockSession(on)
  on('ui.toast', (_$: any, event: any) => {
    toasts.push(String(event.text ?? event.message ?? event))
    return { value: undefined }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  // The check runs in the background, after the session has started.
  await new Promise((resolve) => setTimeout(resolve, 50))

  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('grew +3.4k since last session, mostly MCP server linear (new)')
})

test('/cognita report json prints machine-readable data', async ($, on) => {
  mock.store(on)
  mockSession(on, [], undefined, { CLAUDE_INSPECTOR_BUDGET: '20k', CLAUDE_INSPECTOR_STARTUP_CHECK: '0' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'inspector', args: 'report json' }) as { text: string }
  const data = JSON.parse(text.replace(/^```json\n/, '').replace(/\n```$/, ''))
  expect(data.baseTokens).toBe(27400)
  expect(data.budget).toEqual({ tokens: 20000, isOver: true })
  expect(data.sinceLastSession).toEqual({ isFirst: true })
})

test('/cognita history shows the trend including this session', async ($, on) => {
  mock.store(on, {
    'history:/workspace': {
      ...lastSession['history:/workspace'],
      trend: [{ sessionId: 'an-earlier-session', at: '2026-11-20T09:30:00.000Z', model: 'claude-opus-5-5', baseTokens: 24000 }],
    },
  })
  mockSession(on, [], undefined, { CLAUDE_INSPECTOR_STARTUP_CHECK: '0' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'history' }) as { text: string }
  expect(text).toContain('## Loadout history')
  expect(text).toContain('over the last 2 sessions')
  expect(text).toContain('(this session) | claude-opus-5-5 | 27,400 | +3,400 |')
})

test('/cognita trim prints a plan with commands', async ($, on) => {
  mockSession(on, [], undefined, { CLAUDE_INSPECTOR_STARTUP_CHECK: '0', CLAUDE_INSPECTOR_BUDGET: '25k' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'trim' }) as { text: string }
  expect(text).toContain('## Trim plan')
  expect(text).toContain('claude plugin disable ops --scope local')
  expect(text).toContain('/cognita hold linear')
  expect(text).toContain('within budget')
})
