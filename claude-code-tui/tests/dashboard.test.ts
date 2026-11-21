import { expect, test } from 'claude-code/testing'

const pane = {
  plugin: 'workspace-dashboard',
  component: 'Pane',
  requestId: 'workspace-dashboard',
  viewport: { columns: 120, rows: 40 },
  props: {
    title: 'Claude Code Dashboard',
    isFocused: true,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 32 },
    view: {},
  },
} as const

async function openDashboard($: any, on: any) {
  on('env.get', (_$: any, event: any) => ({
    value: event.name === 'HOME' ? '/home/user' : undefined,
  }))
  on('fs.list', (_$: any, event: any) => ({
    // The engine resolves paths natively (C:\home\user\programming on Windows).
    value: String(event.path).replaceAll('\\', '/').endsWith('/home/user/programming')
      ? [
          { name: 'mixai', kind: 'directory', isLink: false },
          { name: 'clases', kind: 'directory', isLink: false },
          { name: '.private', kind: 'directory', isLink: false },
          { name: 'linked-project', kind: 'directory', isLink: true },
        ]
      : [],
  }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  await $.command.run({ command: 'inspector', args: '' })
  return $.ui.mount({ ...pane, surface: 'terminal' })
}

test('registers the /inspector command when a Claude Code session starts', async ($, on) => {
  const registered: string[] = []
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', ($: any, event: any) => {
    registered.push(event.name)
    return { value: undefined }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  expect(registered).toEqual(['inspector'])
})

test('the dashboard pane contains the requested navigation and workspaces', async ($, on) => {
  const ui = await openDashboard($, on)

  expect(await ui.find({ key: 'tab-dashboard' })).toBeDefined()
  expect(await ui.find({ key: 'tab-agents' })).toBeDefined()
  expect(await ui.find({ key: 'action-new' })).toBeDefined()
  expect(await ui.find({ key: 'action-search' })).toBeDefined()
  expect(await ui.find({ key: 'workspace-mixai' })).toBeDefined()
  expect(await ui.find({ key: 'workspace-clases' })).toBeDefined()
  expect(await ui.find({ key: 'workspace-linked-project' })).toBeUndefined()
  expect(await ui.find({ key: 'workspace-agent-verifier' })).toBeUndefined()
  expect(await ui.find({ key: 'user-settings' })).toBeUndefined()
})

test('the dashboard opens with left navigation and a centered welcome screen', async ($, on) => {
  const ui = await openDashboard($, on)

  expect(await ui.find({ text: 'Claude Code' })).toBeDefined()
  expect(await ui.find({ text: '✳' })).toBeDefined()
  expect(await ui.find({ text: 'What would you like to work on?' })).toBeDefined()
  expect(await ui.find({ key: 'selected-workspace-card' })).toBeDefined()
  expect(await ui.find({ text: '/workspace' })).toBeDefined()
  expect(await ui.find({ key: 'tab-dashboard' })).toBeDefined()
  expect(await ui.find({ key: 'tab-agents' })).toBeDefined()
})

test('the Agents tab switches the pane content', async ($, on) => {
  const ui = await openDashboard($, on)

  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ key: 'agents-menu-running' })).toBeDefined()
  expect(await ui.find({ key: 'agents-menu-launch' })).toBeDefined()
})

test('the Dashboard refreshes its token summary and context snapshot', async ($, on) => {
  on('agent.list', () => ({
    value: [{
      id: 'agent-1',
      name: 'reviewer',
      description: 'Review the selected workspace',
      type: 'Explore',
      status: 'running',
      taskStatus: 'running',
      label: 'Checking changed files',
      cwd: '/workspace/mixai',
      startTime: 1,
      tokenCount: 2400,
      tokenSamples: [900, 1600, 2400],
      kind: 'local_agent',
      hasRow: true,
    }],
  }))
  const ui = await openDashboard($, on)

  await ui.press({ key: 'dashboard-stats-refresh' })

  expect(await ui.find({ text: 'CONTEXT OVERVIEW' })).toBeDefined()
  expect(await ui.find({ text: '2,400' })).toBeDefined()
})

test('Agents shows active details, switches to inactive agents, and filters them', async ($, on) => {
  const reportedAgents: any[] = [
      {
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
      },
      {
        id: 'agent-inactive',
        name: 'planner',
        description: 'Plan the implementation',
        type: 'Plan',
        status: 'completed',
        taskStatus: 'completed',
        label: 'Finished plan',
        cwd: '/workspace',
        startTime: 1,
        tokenCount: 1800,
        tokenSamples: [500, 1200, 1800],
        kind: 'local_agent',
        hasRow: true,
      },
    ]
  on('agent.list', () => ({ value: reportedAgents }))
  const ui = await openDashboard($, on)

  await ui.press({ key: 'tab-agents' })
  expect(await ui.find({ key: 'agent-card-agent-active' })).toBeDefined()
  expect(await ui.find({ key: 'agent-card-agent-inactive' })).toBeUndefined()

  await ui.press({ key: 'agent-card-agent-active' })
  expect(await ui.find({ key: 'agent-detail' })).toBeDefined()
  expect(await ui.find({ text: '900 → 1,600 → 2,400' })).toBeDefined()
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

test('the Agents submenu displays the current session agents in cards', async ($, on) => {
  on('agent.list', () => ({
    value: [{
      id: 'agent-1',
      name: 'reviewer',
      description: 'Review the selected workspace',
      type: 'Explore',
      status: 'running',
      taskStatus: 'running',
      label: 'Checking changed files',
      cwd: '/workspace/mixai',
      startTime: 1,
      tokenCount: 0,
      tokenSamples: [],
      kind: 'local_agent',
      hasRow: true,
    }],
  }))
  const ui = await openDashboard($, on)

  await ui.press({ key: 'tab-agents' })
  await ui.press({ key: 'agents-menu-running' })

  expect(await ui.find({ key: 'agent-card-agent-1' })).toBeDefined()
  expect(await ui.find({ text: 'Checking changed files' })).toBeDefined()
})

test('the Agents submenu launches an agent in the selected workspace', async ($, on) => {
  const spawned: Array<Record<string, unknown>> = []
  on('agent.list', () => ({ value: [] }))
  on('agent.spawn', (_$: any, event: Record<string, unknown>) => {
    spawned.push(event)
    return { agentId: 'agent-2', model: 'sonnet' }
  })
  const ui = await openDashboard($, on)

  await ui.press({ key: 'workspace-mixai' })
  await ui.press({ key: 'tab-agents' })
  await ui.press({ key: 'agents-menu-launch' })
  await ui.input({ key: 'agent-prompt', text: 'Review the current branch' })

  expect(spawned).toEqual([{
    tool: 'Agent',
    prompt: 'Review the current branch',
    description: 'Review the current branch',
    run_in_background: true,
    cwd: '/home/user/programming/mixai',
  }])
})

test('New starts a fresh conversation in the current workspace', async ($, on) => {
  const commands: string[] = []
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('command.run', ($: any, event: any) => {
    commands.push(event.command)
    return { text: '' }
  })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })

  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })
  await ui.press({ key: 'action-new' })

  expect(commands).toEqual(['clear'])
})

test('selecting a workspace updates the dashboard', async ($, on) => {
  const ui = await openDashboard($, on)

  await ui.press({ key: 'workspace-mixai' })
  expect(await ui.find({ key: 'selected-workspace-card' })).toBeDefined()
  expect(await ui.find({ text: 'mixai' })).toBeDefined()
})

test('search filters the pinned workspace list', async ($, on) => {
  const ui = await openDashboard($, on)

  await ui.press({ key: 'action-search' })
  await ui.input({ key: 'workspace-search', text: 'mixai' })

  expect(await ui.find({ key: 'workspace-mixai' })).toBeDefined()
  expect(await ui.find({ key: 'workspace-clases' })).toBeUndefined()
})
