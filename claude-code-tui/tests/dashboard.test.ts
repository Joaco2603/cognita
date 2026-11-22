import { expect, test } from 'claude-code/testing'

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

const tools = [
  { name: 'Bash', description: 'Run a command', mcp: false },
  { name: 'Edit', description: 'Edit a file', mcp: false },
  { name: 'Read', description: 'Read a file', mcp: false },
  { name: 'Write', description: 'Write a file', mcp: false },
  { name: 'mcp__github__create_issue', description: 'Create an issue', mcp: true },
  { name: 'mcp__github__list_prs', description: 'List PRs', mcp: true },
  { name: 'mcp__linear__search', description: 'Search', mcp: true },
]

const settings: Record<string, unknown> = {
  user: {
    permissions: { allow: ['Bash(git push:*)', 'Read(~/.ssh/**)'], deny: ['Read(./.env)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'audit.sh' }] }] },
    enabledPlugins: { 'cognita@cognita': true, 'old@market': false },
  },
  project: { permissions: { ask: ['Bash(rm:*)'] } },
}

/** What the permission system answers for each sample call. */
function verdictFor(tool: string, input: any): { decision: 'allow' | 'ask' | 'deny'; rule?: string } {
  const command = String(input?.command ?? '')
  const path = String(input?.file_path ?? '').replaceAll('\\', '/')
  if (tool === 'Bash' && command.startsWith('git push')) return { decision: 'allow', rule: 'Bash(git push:*)' }
  if (tool === 'Bash' && command.startsWith('rm')) return { decision: 'ask', rule: 'Bash(rm:*)' }
  if (tool === 'Read' && path.endsWith('.ssh/id_rsa')) return { decision: 'allow', rule: 'Read(~/.ssh/**)' }
  if (tool === 'Read' && path.endsWith('.env')) return { decision: 'deny', rule: 'Read(./.env)' }
  if (tool === 'Read') return { decision: 'allow' }
  return { decision: 'ask' }
}

function mockSession(on: any, options: { checks?: string[]; commands?: string[]; agents?: any[]; opened?: string[]; failTools?: boolean } = {}) {
  on('env.get', (_$: any, event: any) => ({
    value: event.name === 'HOME' ? '/home/user' : event.name === 'CLAUDE_INSPECTOR_STARTUP_CHECK' ? '0' : undefined,
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.version', () => ({ value: { version: '2.1.330' } }))
  on('command.register', (_$: any, event: any) => {
    options.commands?.push(event.name)
    return { value: undefined }
  })
  on('command.list', () => ({
    value: [
      { name: 'clear', description: 'Clear', source: 'builtin' },
      { name: 'cognita', description: 'Cognita', source: 'plugin', plugin: 'cognita' },
      { name: 'deploy', description: 'Deploy', source: 'user' },
    ],
  }))
  on('ui.open', (_$: any, event: any) => {
    options.opened?.push(event.id)
    return { value: { isPlaced: true } }
  })
  on('tool.list', () => {
    if (options.failTools) throw new Error('not available')
    return { value: tools }
  })
  on('tool.check', (_$: any, event: any) => {
    options.checks?.push(`${event.tool} ${event.input?.command ?? event.input?.file_path ?? event.input?.url ?? ''}`)
    return verdictFor(event.tool, event.input)
  })
  on('settings.read', (_$: any, event: any) => ({ value: settings[event.source] ?? {} }))
  on('agent.list', () => ({ value: options.agents ?? [] }))
}

async function openCognita($: any, on: any, options: Parameters<typeof mockSession>[1] = {}, viewport?: { columns: number; rows: number; isFullscreen?: boolean }) {
  mockSession(on, options)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  await $.command.run({ command: 'cognita', args: '' })
  // The pane fills itself in the background once it opens.
  await new Promise((resolve) => setTimeout(resolve, 20))
  return $.ui.mount({ ...pane, surface: 'terminal', ...(viewport ? { viewport } : {}) })
}

const runningAgent = {
  id: 'agent-active',
  name: 'reviewer',
  description: 'Review changes',
  type: 'Explore',
  status: 'running',
  taskStatus: 'running',
  label: 'Checking files',
  cwd: '/workspace',
  startTime: 1,
  tokenCount: 2400,
  tokenSamples: [900, 1600, 2400],
  kind: 'local_agent',
  hasRow: true,
}

const finishedAgent = {
  ...runningAgent,
  id: 'agent-inactive',
  name: 'planner',
  description: 'Plan the implementation',
  type: 'Plan',
  status: 'completed',
  taskStatus: 'completed',
  label: 'Finished plan',
  tokenCount: 1800,
  tokenSamples: [500, 1200, 1800],
}

test('registers /cognita and keeps /inspector as an alias', async ($, on) => {
  const commands: string[] = []
  mockSession(on, { commands })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  expect(commands).toEqual(['cognita', 'inspector'])
  const { text } = await $.command.run({ command: 'inspector', args: 'help' }) as { text: string }
  expect(text).toContain('/cognita access')
})

test('the pane opens on the Overview with four views in the sidebar', async ($, on) => {
  const ui = await openCognita($, on, {}, { columns: 120, rows: 40, isFullscreen: false })

  expect(await ui.find({ text: '◆ Cognita' })).toBeDefined()
  expect(await ui.find({ key: 'tab-overview' })).toBeDefined()
  expect(await ui.find({ key: 'tab-context' })).toBeDefined()
  expect(await ui.find({ key: 'tab-access' })).toBeDefined()
  expect(await ui.find({ key: 'tab-agents' })).toBeDefined()
  expect(await ui.find({ key: 'overview-panel' })).toBeDefined()
  expect(await ui.find({ text: 'workspace' })).toBeDefined()
  expect(await ui.find({ key: 'key-hints' })).toBeDefined()
})

test('a narrow docked pane swaps the sidebar for a row of views', async ($, on) => {
  // 150 columns, fullscreen: the dock gets about 67 of them.
  const ui = await openCognita($, on, {}, { columns: 150, rows: 40, isFullscreen: true })

  expect(await ui.find({ key: 'tab-strip' })).toBeDefined()
  expect(await ui.find({ key: 'sidebar-project' })).toBeUndefined()
  await ui.press({ key: 'tab-access' })
  expect(await ui.find({ key: 'access-panel' })).toBeDefined()
})

test('the Overview sums up access and flags risky actions that run without asking', async ($, on) => {
  const ui = await openCognita($, on)

  expect(await ui.find({ text: '7 tools · 2 MCP servers · 3 slash commands' })).toBeDefined()
  expect(await ui.find({ text: '⚠ Runs without asking: push to a git remote, read ssh keys' })).toBeDefined()
  expect(await ui.find({ key: 'overview-access-open' })).toBeDefined()
})

test('the Access tab lists what each sample action would do, without running it', async ($, on) => {
  const checks: string[] = []
  const ui = await openCognita($, on, { checks })
  await ui.press({ key: 'tab-access' })

  expect(await ui.find({ key: 'access-header' })).toBeDefined()
  expect(await ui.find({ key: 'access-probe-push' })).toBeDefined()
  expect(await ui.find({ text: '● Push to a git remote ⚠' })).toBeDefined()
  expect(await ui.find({ text: '○ Read .env secrets ⚠' })).toBeDefined()
  expect(await ui.find({ text: '◐ Delete files (rm -rf) ⚠' })).toBeDefined()
  // WebFetch is not in the tool list, so it is reported, not checked.
  expect(await ui.find({ text: '· Fetch web pages' })).toBeDefined()
  expect(checks.some((check) => check.startsWith('WebFetch'))).toBe(false)
  expect(checks).toContain('Bash git push')
})

test('the Access tab shows tools, rules, hooks and plugins', async ($, on) => {
  const ui = await openCognita($, on)
  await ui.press({ key: 'tab-access' })

  await ui.press({ key: 'access-menu-tools' })
  expect(await ui.find({ key: 'access-mcp-github' })).toBeDefined()
  expect(await ui.find({ key: 'access-mcp-linear' })).toBeDefined()
  expect(await ui.find({ text: 'Bash  Edit  Read  Write' })).toBeDefined()

  await ui.press({ key: 'access-menu-rules' })
  expect(await ui.find({ text: 'Bash(git push:*)' })).toBeDefined()
  expect(await ui.find({ text: 'Bash(rm:*)' })).toBeDefined()
  expect(await ui.find({ key: 'access-source-user' })).toBeDefined()

  await ui.press({ key: 'access-menu-hooks' })
  expect(await ui.find({ key: 'access-hook-pretooluse' })).toBeDefined()
  expect(await ui.find({ key: 'access-plugin-cognita-cognita' })).toBeDefined()
})

test('Access explains itself before the first check and shows a friendly error', async ($, on) => {
  mockSession(on, { failTools: true })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  await $.command.run({ command: 'cognita', args: 'access open' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })

  expect(await ui.find({ text: 'WHAT YOUR AGENT CAN DO' })).toBeDefined()
  expect(await ui.find({ key: 'access-error' })).toBeDefined()
  expect(await ui.find({ key: 'access-refresh' })).toBeDefined()
})

test('/cognita access prints a markdown report without opening the pane', async ($, on) => {
  const opened: string[] = []
  mockSession(on, { opened })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'access' }) as { text: string }

  expect(opened).toEqual([])
  expect(text).toContain('## What this agent can do')
  expect(text).toContain('Model `claude-opus-5-5` · Claude Code 2.1.330')
  expect(text).toContain('2 risky action(s) run without asking: push to a git remote, read ssh keys.')
  expect(text).toContain('| github | 2 |')
  expect(text).toContain('rule `Bash(git push:*)`')
  expect(text).toContain('| PreToolUse | 1 | user |')
})

test('/cognita access json prints machine-readable data', async ($, on) => {
  mockSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'access json' }) as { text: string }
  const data = JSON.parse(text.replace(/^```json\n/, '').replace(/\n```$/, ''))
  expect(data.totalTools).toBe(7)
  expect(data.mcpServers).toEqual([{ server: 'github', tools: 2 }, { server: 'linear', tools: 1 }])
  expect(data.probes.find((probe: any) => probe.key === 'push').verdict).toBe('allow')
})

test('an unknown option explains the commands', async ($, on) => {
  mockSession(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const { text } = await $.command.run({ command: 'cognita', args: 'nope' }) as { text: string }
  expect(text).toContain('Unknown option "nope"')
  expect(text).toContain('/cognita report')
})

test('the Agents tab shows active agents, details, and filters inactive ones', async ($, on) => {
  const reportedAgents: any[] = [structuredClone(runningAgent), structuredClone(finishedAgent)]
  const ui = await openCognita($, on, { agents: reportedAgents })

  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ key: 'agent-card-agent-active' })).toBeDefined()
  expect(await ui.find({ key: 'agent-card-agent-inactive' })).toBeUndefined()

  await ui.press({ key: 'agent-card-agent-active' })
  expect(await ui.find({ key: 'agent-detail' })).toBeDefined()
  expect(await ui.find({ text: 'Token samples: 900 → 1,600 → 2,400' })).toBeDefined()
  reportedAgents[0].tokenCount = 3000
  reportedAgents[0].tokenSamples.push(3000)
  await ui.press({ key: 'agent-detail-refresh' })
  expect(await ui.find({ text: 'Token samples: 900 → 1,600 → 2,400 → 3,000' })).toBeDefined()

  await ui.press({ key: 'agent-detail-back' })
  await ui.press({ key: 'agents-menu-inactive' })
  expect(await ui.find({ key: 'agent-card-agent-inactive' })).toBeDefined()
  expect(await ui.find({ key: 'agent-card-agent-active' })).toBeUndefined()

  await ui.input({ key: 'agent-search', text: 'planner' })
  expect(await ui.find({ key: 'agent-card-agent-inactive' })).toBeDefined()
  await ui.input({ key: 'agent-search', text: 'reviewer' })
  expect(await ui.find({ key: 'agent-card-agent-inactive' })).toBeUndefined()
})

test('the Overview counts the session agents', async ($, on) => {
  const ui = await openCognita($, on, { agents: [runningAgent, finishedAgent] })

  expect(await ui.find({ text: '1 running · 1 finished · 4.2k tokens' })).toBeDefined()
})

test('the Agents tab launches an agent in the current project', async ($, on) => {
  const spawned: Array<Record<string, unknown>> = []
  on('agent.spawn', (_$: any, event: Record<string, unknown>) => {
    spawned.push(event)
    return { agentId: 'agent-2', model: 'sonnet' }
  })
  const ui = await openCognita($, on)

  await ui.press({ key: 'tab-agents' })
  await ui.press({ key: 'agents-menu-launch' })
  await ui.input({ key: 'agent-prompt', text: 'Review the current branch' })

  expect(spawned).toEqual([{
    tool: 'Agent',
    prompt: 'Review the current branch',
    description: 'Review the current branch',
    run_in_background: true,
    cwd: '/workspace',
  }])
})

