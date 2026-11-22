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

const GOAL = 'Build a context pressure viewer for the plugin'

const todo = (content: string, status = 'pending') => ({ content, status, activeForm: content })
const TODOS = [
  todo('Write the model', 'in_progress'),
  todo('Wire the view'),
  todo('Add tests'),
  todo('Update the README'),
  todo('Bump the version'),
  todo('Open the PR'),
]

/** A transcript with one goal prompt and a TodoWrite of six open items. */
const transcript = [
  { role: 'user', text: GOAL, toolUses: [] },
  {
    role: 'assistant',
    text: 'Planning it.',
    toolUses: [{ tool_use_id: 'tu-1', tool: 'TodoWrite', input: { todos: TODOS }, text: 'Todos have been modified successfully.' }],
  },
]

type Session = {
  percent: number
  messages?: unknown[]
  tools?: string[]
  env?: Record<string, string>
  toasts?: string[]
  suggested?: string[]
  submitted?: string[]
  compacted?: string[]
  compactFails?: boolean
  /** No model reply yet: usage has no token count until asked for a breakdown. */
  noCountYet?: boolean
  requested?: unknown[]
}

function breakdownFor(percent: number) {
  const used = percent * 2000
  return {
    categories: [
      { name: 'System tools', tokens: 10000, color: '', isDeferred: false, kind: 'used' },
      { name: 'Messages', tokens: Math.max(0, used - 10000), color: '', isDeferred: false, kind: 'used' },
      { name: 'Free space', tokens: 200000 - used, color: '', isDeferred: false, kind: 'free' },
    ],
    totalTokens: used,
    maxTokens: 200000,
    rawMaxTokens: 200000,
    percentage: percent,
    model: 'claude-opus-5-5',
    memoryFiles: [],
    mcpTools: [],
    agents: [],
    isAutoCompactEnabled: true,
  }
}

function mockSession(on: any, session: Session) {
  on('env.get', (_$: any, event: any) => ({ value: { CLAUDE_INSPECTOR_STARTUP_CHECK: '0', ...session.env }[event.name] }))
  on('fs.list', () => ({ value: [] }))
  on('session.id', () => ({ value: 'this-session' }))
  on('session.start', () => ({ cwd: '/workspace' }))
  on('command.register', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_$: any, event: any) => {
    session.toasts?.push(String(event.text ?? event.message ?? event))
    return { value: undefined }
  })
  on('session.usage', (_$: any, event: any) => {
    session.requested?.push(event.breakdown)
    const context = session.noCountYet && !event.breakdown
      ? { window: 200000 }
      : session.noCountYet
        ? { window: 200000, breakdown: breakdownFor(session.percent) }
        : { tokens: session.percent * 2000, window: 200000, percent: session.percent, breakdown: breakdownFor(session.percent) }
    return { value: { startedAt: 0, context, rateLimits: [] } }
  })
  on('session.messages', () => ({ value: session.messages ?? [] }))
  on('tool.list', () => ({ value: (session.tools ?? ['Bash', 'Read']).map((name) => ({ name, description: name, mcp: name.startsWith('mcp__') })) }))
  on('prompt.suggest', (_$: any, event: any) => {
    session.suggested?.push(event.text)
    return { isShown: true }
  })
  on('prompt.submit', (_$: any, event: any) => {
    session.submitted?.push(event.text)
    return { text: event.text }
  })
  on('session.compact', (_$: any, event: any) => {
    if (session.compactFails) throw new Error('A turn is running.')
    session.compacted?.push(event.instructions)
    return { messages: [{ role: 'user', text: 'Summary of the conversation so far.', toolUses: [] }] }
  })
  on('turn.complete', () => ({ text: '' }))
}

/** Starts a session; the clock it returns runs what the commands leave for after they return. */
async function start($: any, on: any, session: Session) {
  const clock = mock.clock(on)
  mockSession(on, session)
  on('tool.call', () => ({ result: {}, text: 'Todos have been modified successfully.' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/workspace' })
  return clock
}

async function run($: any, args: string): Promise<string> {
  const { text } = await $.command.run({ command: 'cognita', args }) as { text: string }
  return text
}

async function endTurn($: any, agentId?: string) {
  await $.turn.complete({ answer: 'done', durationMs: 10, isAborted: false, turnId: `turn-${Math.random()}`, reason: 'completed', ...(agentId ? { agentId } : {}) } as any)
  // The check runs in the background, after the turn has ended.
  await new Promise((resolve) => setTimeout(resolve, 30))
}

test('/cognita pressure reports the level, the attention signals and each step with its command', async ($, on) => {
  await start($, on, { percent: 75, messages: transcript, tools: ['Bash', 'mcp__engram__mem_save'] })
  const text = await run($, 'pressure')

  expect(text).toContain('## Context pressure: 78% · act')
  expect(text).toContain('window 75% (150,000 of 200,000 tokens)')
  expect(text).toContain('| Open plan items | 6 | 24 / 40 |')
  expect(text).toContain('Run `/cognita save`')
  expect(text).toContain('use mcp__engram__mem_save to save to Engram')
  expect(text).toContain(`/compact Keep: the goal "${GOAL}"; in progress: Write the model; open plan: Wire the view, Add tests, Update the README, Bump the version, Open the PR;`)
  expect(text).toContain('Run `/cognita split`')
})

test('/cognita pressure json prints machine-readable data', async ($, on) => {
  await start($, on, { percent: 20 })
  const text = await run($, 'pressure json')
  const json = JSON.parse(text.replace(/^```json\n/, '').replace(/\n```$/, ''))

  expect(json.shape).toBe('cognita-pressure-1')
  expect(json.level).toBe('ok')
  expect(json.recommendations).toEqual([])
})

test('thresholds come from CLAUDE_INSPECTOR_PRESSURE_WATCH and _ACT', async ($, on) => {
  await start($, on, { percent: 35, env: { CLAUDE_INSPECTOR_PRESSURE_WATCH: '20', CLAUDE_INSPECTOR_PRESSURE_ACT: '30' } })
  const text = await run($, 'pressure')

  expect(text).toContain('## Context pressure: 35% · act')
  expect(text).toContain('ok below 20%, watch from 20%, act from 30%')
})

test('a turn that raises the pressure warns once and suggests the one step to take', async ($, on) => {
  const session: Session = { percent: 30, toasts: [], suggested: [] }
  await start($, on, session)

  await endTurn($)
  expect(session.toasts).toEqual([])

  session.percent = 80
  await endTurn($, 'subagent-1')
  expect(session.toasts).toEqual([])

  await endTurn($)
  expect(session.toasts).toEqual(['Context pressure 80% (act): window 80%. Run /cognita compact to compact and keep the goal and plan.'])
  expect(session.suggested).toEqual(['/cognita compact'])

  await endTurn($)
  expect(session.toasts?.length).toBe(1)
})

test('CLAUDE_INSPECTOR_PRESSURE_ALERT=0 keeps the automatic check quiet', async ($, on) => {
  const session: Session = { percent: 90, toasts: [], env: { CLAUDE_INSPECTOR_PRESSURE_ALERT: '0' } }
  await start($, on, session)
  await endTurn($)

  expect(session.toasts).toEqual([])
})

test('/cognita compact compacts, once the command has returned, with focus built from the goal and the plan', async ($, on) => {
  const session: Session = { percent: 75, messages: transcript, compacted: [], toasts: [] }
  const clock = await start($, on, session)
  const text = await run($, 'compact')

  expect(text).toContain(`Compacting, keeping:\n\n> Keep: the goal "${GOAL}"; in progress: Write the model;`)
  expect(session.compacted).toEqual([])

  await clock.advance(200)
  expect(session.compacted?.length).toBe(1)
  expect(session.compacted?.[0]).toContain(`Keep: the goal "${GOAL}"; in progress: Write the model;`)
  expect(session.toasts).toEqual(['Compacted, keeping the goal and the open plan.'])
})

test('/cognita compact prints the /compact line and warns when it cannot compact', async ($, on) => {
  const session: Session = { percent: 75, messages: transcript, compactFails: true, toasts: [] }
  const clock = await start($, on, session)
  const text = await run($, 'compact')

  expect(text).toContain(`If it does not start, run:\n\n\`\`\`\n/compact Keep: the goal "${GOAL}"`)
  await clock.advance(200)
  expect(session.toasts?.[0]).toContain('Could not compact now')
})

test('/cognita split sends the prompt that hands the pending items to subagents', async ($, on) => {
  const session: Session = { percent: 40, messages: transcript, submitted: [] }
  const clock = await start($, on, session)
  const text = await run($, 'split')
  expect(text).toContain('Sending this to Claude:')

  await clock.advance(200)
  expect(session.submitted?.length).toBe(1)
  expect(session.submitted?.[0]).toContain('1) Wire the view; 2) Add tests; 3) Update the README; 4) Bump the version; 5) Open the PR')
})

test('/cognita save sends the Engram prompt, or explains that no Engram server is connected', async ($, on) => {
  const session: Session = { percent: 40, messages: transcript, submitted: [], tools: ['Bash'] }
  const clock = await start($, on, session)
  expect(await run($, 'save')).toContain('No Engram MCP server is connected')
  await clock.advance(200)
  expect(session.submitted).toEqual([])

  session.tools = ['mcp__plugin_engram_engram__mem_save']
  await run($, 'save')
  await clock.advance(200)
  expect(session.submitted?.[0]).toContain('use mcp__plugin_engram_engram__mem_save to save to Engram')
  expect(session.submitted?.[0]).toContain('the open plan (6 items)')
})

test('the plan tracked from tool calls outlives a compaction', async ($, on) => {
  const session: Session = { percent: 60, messages: [] }
  await start($, on, session)
  await $.tool.call({ tool: 'TodoWrite', todos: TODOS } as any)

  // After a compaction the transcript no longer holds the TodoWrite call.
  const text = await run($, 'pressure')
  expect(text).toContain('| Open plan items | 6 | 24 / 40 |')
})

test('the Overview shows the pressure card with the next step, and c compacts', async ($, on) => {
  const session: Session = { percent: 80, messages: transcript, compacted: [], toasts: [] }
  await start($, on, session)
  await $.command.run({ command: 'cognita', args: '' })
  await new Promise((resolve) => setTimeout(resolve, 30))
  const ui = await $.ui.mount({ ...pane, surface: 'terminal' })

  expect(await ui.find({ key: 'overview-pressure' })).toBeDefined()
  // window 80 + ½ × attention 25.05 × 0.2 ≈ 83
  expect(await ui.find({ text: `${'█'.repeat(17)}${'░'.repeat(3)} 83% · act` })).toBeDefined()
  expect(await ui.find({ text: 'window 80% + attention 25 (estimate) · 6 open plan items · 1 prompt' })).toBeDefined()
  expect(await ui.find({ text: 'Next: Compact, keeping the goal and the plan → /cognita compact' })).toBeDefined()

  await ui.press({ key: 'pressure-compact' })
  expect(session.compacted?.length).toBe(1)
  expect(session.toasts).toContain('Compacted, keeping the goal and the open plan.')
})

test('before the first reply, the window comes from the breakdown of what is loaded', async ($, on) => {
  const session: Session = { percent: 17, noCountYet: true, requested: [] }
  await start($, on, session)
  const text = await run($, 'pressure')

  expect(session.requested).toEqual([undefined, 'summary'])
  expect(text).toContain('window 17% (34,000 of 200,000 tokens)')
})
