import { analyzeAccess, formatAccess, formatAccessJson, PROBES, SETTINGS_SOURCES, type AccessReport, type ProbeResult, type SettingsSourceName } from './access.js'
import { renderAccess } from './access-view.js'
import { renderAgents } from './agents-view.js'
import { renderContext } from './context-view.js'
import { renderOverview, renderSidebar } from './dashboard-view.js'
import {
  DEFAULT_GROWTH_ALERT,
  diffLoadout,
  emptyUsage,
  formatHistory,
  formatJson,
  formatTrimPlan,
  formatReport,
  measurePrompt,
  recordSkillUse,
  recordToolCall,
  parseTokens,
  rememberSnapshot,
  sinceBadge,
  startupAlert,
  summarize,
  toSnapshot,
  trendOf,
  type AlertSettings,
  type Loadout,
  type LoadoutDiff,
  type PromptCapture,
  type UsageLog,
} from './loadout.js'
import {
  basename,
  type AccessSubview,
  type AgentSubview,
  type ContextSubview,
  type DashboardTab,
  type Workspace,
} from './utils.js'

const PANE_ID = 'cognita'
const COMMAND_NAME = 'cognita'
/** The name earlier versions used; it keeps working. */
const LEGACY_COMMAND_NAME = 'inspector'

const HELP = [
  '**/cognita** · see what your agent has loaded and what it can do',
  '',
  '- `/cognita`: open the Cognita pane (Overview, Context, Access, Agents)',
  '- `/cognita access`: what the agent can reach: tools, MCP servers, risky actions, permission rules, hooks, plugins',
  '- `/cognita access json`: the same as JSON',
  '- `/cognita report`: what this session has loaded into context (estimated; `full` for an exact count, `json` for scripts)',
  '- `/cognita trim`: a step-by-step plan, with commands, to shrink what loads before the first message',
  '- `/cognita history`: how the loadout changed across the last sessions in this project',
  '- `/cognita context` · `/cognita access open`: open the pane on that view',
  '- `/cognita help`: this list',
  '',
  '`/inspector` is an alias of `/cognita`.',
].join('\n')

/** Everything the pane and the commands share during one session. */
type State = {
  activeTab: DashboardTab
  agentSubview: AgentSubview
  contextSubview: ContextSubview
  accessSubview: AccessSubview
  currentDirectory: string
  model: string
  agentSearch: string
  selectedAgentId: string
  agentPrompt: string
  sessionAgents: AgentInfo[]
  agentError: string
  loadingAgents: boolean
  launchingAgent: boolean
  isStatusLineEnabled: boolean
  alerts: AlertSettings
  // Context loadout: measured on demand, plus what the observe hooks record.
  usageLog: UsageLog
  loadout?: Loadout
  loadoutDetail: 'summary' | 'full'
  measuredAt: string
  measuring: boolean
  contextError: string
  /** The comparison with this project's previous session; undefined until known. */
  since?: LoadoutDiff | 'first'
  promptSections: readonly PromptComposeSection[]
  promptBlocks: readonly PromptContextBlock[]
  instructionFiles: readonly InstructionFile[]
  // Access: what the agent can reach and do, checked on demand.
  access?: AccessReport
  accessCheckedAt: string
  checkingAccess: boolean
  accessError: string
}

function createState(): State {
  return {
    activeTab: 'overview',
    agentSubview: 'active',
    contextSubview: 'overview',
    accessSubview: 'actions',
    currentDirectory: '',
    model: '',
    agentSearch: '',
    selectedAgentId: '',
    agentPrompt: '',
    sessionAgents: [],
    agentError: '',
    loadingAgents: false,
    launchingAgent: false,
    isStatusLineEnabled: true,
    alerts: { growth: DEFAULT_GROWTH_ALERT },
    usageLog: emptyUsage(),
    loadoutDetail: 'summary',
    measuredAt: '',
    measuring: false,
    contextError: '',
    promptSections: [],
    promptBlocks: [],
    instructionFiles: [],
    accessCheckedAt: '',
    checkingAccess: false,
    accessError: '',
  }
}

function promptCapture(state: State): PromptCapture | undefined {
  return state.promptSections.length > 0 || state.promptBlocks.length > 0
    ? measurePrompt(state.promptSections, state.promptBlocks, state.instructionFiles)
    : undefined
}

function applyLoadout(state: State, measured: Measured, detail: 'summary' | 'full'): Loadout {
  state.loadout = measured.loadout
  state.since = measured.since ?? state.since
  state.loadoutDetail = detail
  if (!state.model && measured.loadout.model) state.model = measured.loadout.model
  state.measuredAt = new Date().toLocaleTimeString()
  return measured.loadout
}

function applyAccess(state: State, report: AccessReport): AccessReport {
  state.access = report
  state.accessCheckedAt = new Date().toLocaleTimeString()
  if (report.model && report.model !== 'unknown model') state.model = report.model
  return report
}

async function refreshLoadout($: ModApi, state: State, detail: 'summary' | 'full'): Promise<void> {
  if (state.measuring) return
  state.measuring = true
  state.contextError = ''
  $.ui.invalidate('ui.render')
  try {
    applyLoadout(state, await readLoadout($, detail, state.usageLog, state.currentDirectory), detail)
  } catch {
    state.contextError = 'Could not measure the context window for this session.'
  } finally {
    state.measuring = false
    $.ui.invalidate('ui.render')
  }
}

async function refreshAccess($: ModApi, state: State): Promise<void> {
  if (state.checkingAccess) return
  state.checkingAccess = true
  state.accessError = ''
  $.ui.invalidate('ui.render')
  try {
    applyAccess(state, await readAccess($, state.currentDirectory))
  } catch {
    state.accessError = 'Could not read the tools and permissions of this session.'
  } finally {
    state.checkingAccess = false
    $.ui.invalidate('ui.render')
  }
}

async function refreshAgents($: ModApi, state: State): Promise<void> {
  state.loadingAgents = true
  state.agentError = ''
  $.ui.invalidate('ui.render')
  try {
    state.sessionAgents = await $.agent.list()
  } catch {
    state.sessionAgents = []
    state.agentError = 'Could not load agents for this Claude Code session.'
  } finally {
    state.loadingAgents = false
    $.ui.invalidate('ui.render')
  }
}

/** Everything the Overview shows, fetched together. */
async function refreshAll($: ModApi, state: State): Promise<void> {
  await Promise.allSettled([
    refreshLoadout($, state, state.loadoutDetail),
    refreshAccess($, state),
    refreshAgents($, state),
  ])
}

/** On open, fetch only what is missing; r refreshes everything. */
async function fillMissing($: ModApi, state: State): Promise<void> {
  await Promise.allSettled([
    state.loadout ? undefined : refreshLoadout($, state, 'summary'),
    state.access ? undefined : refreshAccess($, state),
    refreshAgents($, state),
  ])
}

/** Switches the pane to a view and loads what that view needs. */
function openTab($: ModApi, state: State, tab: DashboardTab): void {
  state.activeTab = tab
  $.ui.invalidate('ui.render')
  if (tab === 'context' && !state.loadout) void refreshLoadout($, state, 'summary')
  if (tab === 'access' && !state.access) void refreshAccess($, state)
  if (tab === 'agents') {
    state.agentSubview = 'active'
    void refreshAgents($, state)
  }
}

/**
 * One quick measurement in the background at startup: it saves this session's
 * loadout for the next comparison and warns when it grew or is over budget.
 */
async function startupCheck($: ModApi, state: State): Promise<void> {
  state.measuring = true
  try {
    const measured = await readLoadout($, 'summary', state.usageLog, state.currentDirectory)
    state.measuring = false
    if (state.loadout) return
    applyLoadout(state, measured, 'summary')
    const alert = startupAlert(measured.loadout, measured.since, state.alerts)
    if (alert) await $.ui.toast(alert)
  } catch {
    // The startup check is a convenience; /cognita measures again.
  } finally {
    state.measuring = false
    $.ui.invalidate('ui.render')
  }
}

async function launchAgent($: ModApi, state: State, project: Workspace, value: string): Promise<void> {
  const task = value.trim()
  if (!task || state.launchingAgent) return
  state.launchingAgent = true
  $.ui.invalidate('ui.render')
  try {
    const result = await $.agent.spawn({
      prompt: task,
      description: task.length > 64 ? `${task.slice(0, 61)}…` : task,
      cwd: project.path || undefined,
    })
    if (result.deny) {
      await $.ui.toast(`Could not start agent: ${result.deny}`)
      return
    }
    state.agentPrompt = ''
    state.agentSubview = 'active'
    await refreshAgents($, state)
    await $.ui.toast(`Agent started in ${project.name}.`)
  } catch {
    await $.ui.toast(`Could not start an agent in ${project.name}.`)
  } finally {
    state.launchingAgent = false
    $.ui.invalidate('ui.render')
  }
}

async function runCommand($: ModApi, state: State, event: ModEvent): Promise<{ text?: string }> {
  const [subcommand = '', option = '', ...rest] = (event.args ?? '').trim().toLowerCase().split(/\s+/)
  const options = new Set([option, ...rest])

  if (subcommand === 'help') return { text: HELP }

  if (subcommand === 'access' && !options.has('open')) {
    try {
      const report = applyAccess(state, await readAccess($, state.currentDirectory))
      if (options.has('json')) return { text: '```json\n' + formatAccessJson(report) + '\n```' }
      return { text: formatAccess(report) }
    } catch {
      return { text: 'Could not read the tools and permissions of this session.' }
    }
  }

  if (subcommand === 'report') {
    try {
      const detail = options.has('full') ? 'full' : 'summary'
      const measured = applyLoadout(state, await readLoadout($, detail, state.usageLog, state.currentDirectory), detail)
      if (options.has('json')) return { text: '```json\n' + formatJson(measured, state.since, state.alerts) + '\n```' }
      return { text: formatReport(measured, promptCapture(state), state.usageLog, state.since, state.alerts.budget) }
    } catch {
      return { text: 'Could not measure the context window for this session.' }
    }
  }

  if (subcommand === 'trim') {
    try {
      const measured = applyLoadout(state, await readLoadout($, 'summary', state.usageLog, state.currentDirectory), 'summary')
      return { text: formatTrimPlan(measured, state.alerts.budget) }
    } catch {
      return { text: 'Could not measure the context window for this session.' }
    }
  }

  if (subcommand === 'history') {
    try {
      // Measuring first adds this session to the trend.
      applyLoadout(state, await readLoadout($, 'summary', state.usageLog, state.currentDirectory), 'summary')
      const trend = trendOf(await $.store.get(`history:${state.currentDirectory}`))
      return { text: formatHistory(trend, await $.session.id(), state.alerts.budget) }
    } catch {
      return { text: 'Could not read the loadout history for this project.' }
    }
  }

  if (subcommand === 'context' || subcommand === 'access' || subcommand === 'agents' || subcommand === 'overview') {
    state.activeTab = subcommand
  } else if (subcommand) {
    return { text: `Unknown option "${subcommand}".\n\n${HELP}` }
  } else {
    state.activeTab = 'overview'
  }

  // Fill what the pane shows; each part redraws as it arrives.
  void fillMissing($, state)

  try {
    await $.ui.open({ id: PANE_ID, title: 'Cognita', focus: true, closeOnEscape: true })
    return {}
  } catch {
    return { text: 'Could not open the Cognita pane. Try `/cognita report` or `/cognita access` instead.' }
  }
}

function renderPane($: ModApi, state: State, event: ModEvent): unknown {
  const ui = $.ui.resolve(event)
  const redraw = () => $.ui.invalidate('ui.render')
  const project: Workspace = { name: basename(state.currentDirectory) || 'this project', path: state.currentDirectory }
  const select = (tab: DashboardTab) => openTab($, state, tab)

  const sidebar = renderSidebar(ui, {
    activeTab: state.activeTab,
    project: project.name,
    model: state.model,
    onTabSelect: select,
  })

  let content: unknown
  if (state.activeTab === 'overview') {
    content = renderOverview(ui, {
      loadout: state.loadout,
      access: state.access,
      sessionAgents: state.sessionAgents,
      loading: state.measuring || state.checkingAccess,
      error: [state.contextError, state.accessError].filter(Boolean).join(' '),
      onRefresh: () => void refreshAll($, state),
      onOpen: select,
    })
  } else if (state.activeTab === 'context') {
    content = renderContext(ui, {
      loadout: state.loadout,
      since: state.since,
      prompt: promptCapture(state),
      subview: state.contextSubview,
      measuredAt: state.measuredAt,
      detail: state.loadoutDetail,
      loading: state.measuring,
      error: state.contextError,
      onRefresh: (detail) => void refreshLoadout($, state, detail),
      onSubviewChange: (subview) => {
        state.contextSubview = subview
        redraw()
      },
    })
  } else if (state.activeTab === 'access') {
    content = renderAccess(ui, {
      access: state.access,
      subview: state.accessSubview,
      loading: state.checkingAccess,
      error: state.accessError,
      checkedAt: state.accessCheckedAt,
      onRefresh: () => void refreshAccess($, state),
      onSubviewChange: (subview) => {
        state.accessSubview = subview
        redraw()
      },
    })
  } else {
    content = renderAgents(ui, {
      agentSubview: state.agentSubview,
      agentSearch: state.agentSearch,
      agentPrompt: state.agentPrompt,
      sessionAgents: state.sessionAgents,
      selectedAgentId: state.selectedAgentId,
      selectedWorkspace: project,
      agentError: state.agentError,
      loadingAgents: state.loadingAgents,
      launchingAgent: state.launchingAgent,
      redraw,
      onSubviewChange: (subview) => {
        state.agentSubview = subview
        if (subview === 'active' || subview === 'inactive') state.agentSearch = ''
      },
      onAgentSearchInput: (value) => {
        state.agentSearch = value
        redraw()
      },
      onAgentSearchSubmit: (value) => {
        state.agentSearch = value
        redraw()
      },
      onRefreshAgents: () => refreshAgents($, state),
      onSelectAgent: (agentId) => {
        state.selectedAgentId = agentId
        state.agentSubview = 'detail'
        redraw()
      },
      onAgentPromptInput: (value) => {
        state.agentPrompt = value
      },
      onAgentPromptSubmit: (value) => launchAgent($, state, project, value),
    })
  }

  return ui.Box({
    flexDirection: 'row',
    flexGrow: 1,
    columnGap: 1,
    children: [sidebar, content],
  })
}

export function register(on: ModOn): void {
  const state = createState()

  on('session.start', async ($, event, next) => {
    for (const name of [COMMAND_NAME, LEGACY_COMMAND_NAME]) {
      await $.command.register({
        name,
        description: name === COMMAND_NAME
          ? 'See what your agent has loaded and what it can do (try: /cognita access)'
          : 'Alias of /cognita',
      })
    }
    state.currentDirectory = event.cwd ?? ''
    state.isStatusLineEnabled = (await $.env.get('CLAUDE_INSPECTOR_STATUSLINE'))?.trim() !== '0'
    state.alerts = await readAlertSettings($)
    const isStartupCheckEnabled = (await $.env.get('CLAUDE_INSPECTOR_STARTUP_CHECK'))?.trim() !== '0'
    const result = await next?.(event)
    if (isStartupCheckEnabled && event.isInteractive !== false && !state.loadout && !state.measuring) {
      void startupCheck($, state)
    }
    return result
  })

  on('command.run', { command: COMMAND_NAME }, ($, event) => runCommand($, state, event))
  on('command.run', { command: LEGACY_COMMAND_NAME }, ($, event) => runCommand($, state, event))

  // Observe-only hooks: they record what the session uses and always pass
  // the event on unchanged, so a failure here never changes what Claude does.
  on('tool.call', ($, event, next) => {
    try {
      if (typeof event.tool === 'string') recordToolCall(state.usageLog, event.tool)
    } catch {
      // Recording is best effort.
    }
    return next?.(event)
  })

  on('skill.prompt', ($, event, next) => {
    try {
      if (typeof event.skill === 'string') recordSkillUse(state.usageLog, event.skill)
    } catch {
      // Recording is best effort.
    }
    return next?.(event)
  })

  on('prompt.compose', async ($, event, next) => {
    const result = await next?.(event)
    if (Array.isArray(result?.sections)) state.promptSections = result.sections
    return result
  })

  on('prompt.context', async ($, event, next) => {
    const result = await next?.(event)
    if (Array.isArray(result?.blocks)) state.promptBlocks = result.blocks
    const files = result?.instructionFiles ?? event.instructionFiles
    if (Array.isArray(files)) state.instructionFiles = files
    return result
  })

  on('session.measure', ($, event, next) => {
    if (state.isStatusLineEnabled) {
      try {
        const context = event.context as SessionUsage['context'] | undefined
        const cost = event.cost as SessionUsage['cost']
        const percent = context?.percent
        $.ui.status(percent === undefined
          ? undefined
          : [`ctx ${Math.round(percent)}%`, cost ? `$${cost.usd.toFixed(2)}` : '', sinceBadge(state.since)].filter(Boolean).join(' · '))
      } catch {
        // The status line is cosmetic.
      }
    }
    return next?.(event)
  })

  on('ui.render', { component: 'Pane' }, ($, event, next) => {
    if (event.requestId !== PANE_ID) return next?.(event)
    return renderPane($, state, event)
  })
}

type Measured = { loadout: Loadout; since?: LoadoutDiff | 'first' }

/** Measures the context window and joins it with what the session has used. */
async function readLoadout($: ModApi, detail: 'summary' | 'full', usageLog: UsageLog, cwd: string): Promise<Measured> {
  const usage = await $.session.usage({ breakdown: detail, columns: 80 })
  const breakdown = usage.context.breakdown
  if (!breakdown) throw new Error('Claude Code returned no context breakdown.')
  const loadout = summarize(breakdown, usageLog)
  return { loadout, since: await compareWithLastSession($, cwd, loadout) }
}

/**
 * Reads what the agent can reach: its tools, what the permission system answers
 * for a set of sample actions (asked, never run), settings, plugins and commands.
 * Every part is best effort, so one failing API leaves the rest of the report.
 */
async function readAccess($: ModApi, cwd: string): Promise<AccessReport> {
  const tools = await $.tool.list()
  const names = new Set(tools.map((tool) => tool.name))
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '~'
  const paths = { cwd: cwd || '.', home }

  const probes = await Promise.all(PROBES.map(async (probe): Promise<ProbeResult> => {
    const base = { key: probe.key, label: probe.label, tool: probe.tool, isRisky: probe.isRisky }
    if (!names.has(probe.tool)) return { ...base, verdict: 'missing' }
    try {
      const result = await $.tool.check({ tool: probe.tool, input: probe.input(paths) })
      return { ...base, verdict: result.decision, reason: result.reason, rule: result.rule }
    } catch {
      return { ...base, verdict: 'unknown' }
    }
  }))

  const settings: Partial<Record<SettingsSourceName, unknown>> = {}
  await Promise.all(SETTINGS_SOURCES.map(async (source) => {
    try {
      settings[source] = await $.settings.read({ source })
    } catch {
      // A source that is absent or unreadable adds nothing.
    }
  }))

  const [commands, model, version] = await Promise.all([
    $.command.list().catch(() => []),
    $.session.model().catch(() => undefined),
    $.session.version().then((value) => value.version).catch(() => undefined),
  ])

  return analyzeAccess({ model, version, tools, probes, settings, commands })
}

/** Budget and growth warnings from CLAUDE_INSPECTOR_BUDGET and CLAUDE_INSPECTOR_ALERT. */
async function readAlertSettings($: ModApi): Promise<AlertSettings> {
  const budget = parseTokens(await $.env.get('CLAUDE_INSPECTOR_BUDGET'))
  const growth = parseTokens(await $.env.get('CLAUDE_INSPECTOR_ALERT'))
  return { budget: budget || undefined, growth: growth ?? DEFAULT_GROWTH_ALERT }
}

/**
 * Saves this measurement for the project and compares it with the last one
 * another session saved. Best effort: a store failure only loses the comparison.
 */
async function compareWithLastSession($: ModApi, cwd: string, loadout: Loadout): Promise<LoadoutDiff | 'first' | undefined> {
  if (!cwd) return undefined
  try {
    const key = `history:${cwd}`
    const snapshot = toSnapshot(loadout, await $.session.id())
    const { history, baseline } = rememberSnapshot(await $.store.get(key), snapshot)
    await $.store.set(key, history)
    return baseline ? diffLoadout(baseline, snapshot) : 'first'
  } catch {
    return undefined
  }
}
