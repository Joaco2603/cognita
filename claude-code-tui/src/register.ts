import { renderAgents } from './agents-view.js'
import { renderContext } from './context-view.js'
import { renderDashboard, renderSidebar } from './dashboard-view.js'
import {
  DEFAULT_GROWTH_ALERT,
  diffLoadout,
  emptyUsage,
  formatJson,
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
  type AlertSettings,
  type Loadout,
  type LoadoutDiff,
  type PromptCapture,
  type UsageLog,
} from './loadout.js'
import {
  basename,
  dirname,
  joinPath,
  type AgentSubview,
  type ContextSubview,
  type DashboardTab,
  type Workspace,
} from './utils.js'

const PANE_ID = 'workspace-dashboard'
const COMMAND_NAME = 'inspector'

const HELP = [
  '**/inspector** · Workspace Dashboard',
  '',
  '- `/inspector`: open the dashboard pane',
  '- `/inspector context`: open the pane on the context loadout',
  '- `/inspector report`: print what this session has loaded (estimated)',
  '- `/inspector report full`: same, with an exact token count',
  '- `/inspector report json`: the same data as JSON, for scripts and CI (add `full` for exact counts)',
  '- `/inspector help`: this list',
].join('\n')

export function register(on: ModOn): void {
  let activeTab: DashboardTab = 'dashboard'
  let agentSubview: AgentSubview = 'active'
  let contextSubview: ContextSubview = 'overview'
  let currentDirectory = ''
  let workspaces: Workspace[] = []
  let selectedWorkspace = ''
  let searchOpen = false
  let searchValue = ''
  let agentSearch = ''
  let selectedAgentId = ''
  let agentPrompt = ''
  let sessionAgents: AgentInfo[] = []
  let agentError = ''
  let loadingAgents = false
  let launchingAgent = false
  let dashboardError = ''
  let contextSnapshots: Array<{ capturedAt: string; text: string }> = []
  let isStatusLineEnabled = true
  let alerts: AlertSettings = { growth: DEFAULT_GROWTH_ALERT }

  // Context loadout: measured on demand, plus what the hooks below observe.
  const usageLog = emptyUsage()
  let loadout: Loadout | undefined
  let loadoutDetail: 'summary' | 'full' = 'summary'
  let measuredAt = ''
  let measuring = false
  let contextError = ''
  /** The comparison with this project's previous session; undefined until known. */
  let since: LoadoutDiff | 'first' | undefined
  let promptSections: readonly PromptComposeSection[] = []
  let promptBlocks: readonly PromptContextBlock[] = []
  let instructionFiles: readonly InstructionFile[] = []

  const promptCapture = (): PromptCapture | undefined =>
    promptSections.length > 0 || promptBlocks.length > 0
      ? measurePrompt(promptSections, promptBlocks, instructionFiles)
      : undefined

  const applyLoadout = (measured: Measured, detail: 'summary' | 'full'): Loadout => {
    loadout = measured.loadout
    since = measured.since ?? since
    loadoutDetail = detail
    measuredAt = new Date().toLocaleTimeString()
    return measured.loadout
  }

  on('session.start', async ($, event, next) => {
    await $.command.register({
      name: COMMAND_NAME,
      description: 'Workspace dashboard and context loadout (try: /inspector report)',
    })
    currentDirectory = event.cwd ?? ''
    isStatusLineEnabled = (await $.env.get('CLAUDE_INSPECTOR_STATUSLINE'))?.trim() !== '0'
    alerts = await readAlertSettings($)
    const isStartupCheckEnabled = (await $.env.get('CLAUDE_INSPECTOR_STARTUP_CHECK'))?.trim() !== '0'
    ;({ workspaces, selectedWorkspace } = await discoverWorkspaces($, currentDirectory))
    const result = await next?.(event)

    // One quick measurement in the background: it saves this session's loadout
    // for the next comparison and warns when the loadout grew or is over budget.
    if (isStartupCheckEnabled && event.isInteractive !== false && !loadout) {
      void readLoadout($, 'summary', usageLog, currentDirectory).then(async (measured) => {
        if (loadout) return
        applyLoadout(measured, 'summary')
        const alert = startupAlert(measured.loadout, measured.since, alerts)
        if (alert) await $.ui.toast(alert)
        $.ui.invalidate('ui.render')
      }).catch(() => undefined)
    }
    return result
  })

  on('command.run', { command: COMMAND_NAME }, async ($, event) => {
    const [subcommand = '', option = '', ...rest] = (event.args ?? '').trim().toLowerCase().split(/\s+/)

    if (subcommand === 'help') return { text: HELP }

    if (subcommand === 'report') {
      try {
        const options = new Set([option, ...rest])
        const detail = options.has('full') ? 'full' : 'summary'
        const measured = applyLoadout(await readLoadout($, detail, usageLog, currentDirectory), detail)
        if (options.has('json')) return { text: '```json\n' + formatJson(measured, since, alerts) + '\n```' }
        return { text: formatReport(measured, promptCapture(), usageLog, since, alerts.budget) }
      } catch {
        return { text: 'Could not measure the context window for this session.' }
      }
    }

    if (subcommand === 'context') {
      activeTab = 'context'
      if (!loadout) void readLoadout($, 'summary', usageLog, currentDirectory).then((measured) => {
        applyLoadout(measured, 'summary')
        $.ui.invalidate('ui.render')
      }, () => undefined)
    } else if (subcommand) {
      return { text: `Unknown option "${subcommand}".\n\n${HELP}` }
    }

    return $.ui
      .open({ id: PANE_ID, title: 'Claude Code', focus: true, closeOnEscape: true })
      .then(() => ({}))
      .catch(() => ({ text: 'Could not open Workspace Dashboard.' }))
  })

  // Observe-only hooks: they record what the session uses and always pass
  // the event on unchanged, so a failure here never changes what Claude does.
  on('tool.call', ($, event, next) => {
    try {
      if (typeof event.tool === 'string') recordToolCall(usageLog, event.tool)
    } catch {
      // Recording is best effort.
    }
    return next?.(event)
  })

  on('skill.prompt', ($, event, next) => {
    try {
      if (typeof event.skill === 'string') recordSkillUse(usageLog, event.skill)
    } catch {
      // Recording is best effort.
    }
    return next?.(event)
  })

  on('prompt.compose', async ($, event, next) => {
    const result = await next?.(event)
    if (Array.isArray(result?.sections)) promptSections = result.sections
    return result
  })

  on('prompt.context', async ($, event, next) => {
    const result = await next?.(event)
    if (Array.isArray(result?.blocks)) promptBlocks = result.blocks
    const files = result?.instructionFiles ?? event.instructionFiles
    if (Array.isArray(files)) instructionFiles = files
    return result
  })

  on('session.measure', ($, event, next) => {
    if (isStatusLineEnabled) {
      try {
        const context = event.context as SessionUsage['context'] | undefined
        const cost = event.cost as SessionUsage['cost']
        const percent = context?.percent
        $.ui.status(percent === undefined
          ? undefined
          : [`ctx ${Math.round(percent)}%`, cost ? `$${cost.usd.toFixed(2)}` : '', sinceBadge(since)].filter(Boolean).join(' · '))
      } catch {
        // The status line is cosmetic.
      }
    }
    return next?.(event)
  })

  on('ui.render', { component: 'Pane' }, async ($, event, next) => {
    if (event.requestId !== PANE_ID) return next?.(event)

    const ui = $.ui.resolve(event)
    const redraw = () => $.ui.invalidate('ui.render')

    const refreshLoadout = async (detail: 'summary' | 'full') => {
      if (measuring) return
      measuring = true
      contextError = ''
      redraw()
      try {
        applyLoadout(await readLoadout($, detail, usageLog, currentDirectory), detail)
      } catch {
        contextError = 'Could not measure the context window for this session.'
      } finally {
        measuring = false
        redraw()
      }
    }

    const refreshDashboardContext = async () => {
      dashboardError = ''
      const [agentResult, contextResult] = await Promise.allSettled([
        $.agent.list(),
        $.command.run({ command: 'context' }),
        readLoadout($, 'summary', usageLog, currentDirectory).then((measured) => applyLoadout(measured, 'summary')),
      ])
      if (agentResult.status === 'fulfilled') sessionAgents = agentResult.value
      else dashboardError = 'Could not load subagent token statistics.'

      if (contextResult.status === 'fulfilled' && contextResult.value.text?.trim()) {
        contextSnapshots = [
          ...contextSnapshots,
          { capturedAt: new Date().toLocaleTimeString(), text: contextResult.value.text.trim() },
        ].slice(-3)
      } else if (contextResult.status === 'rejected') {
        dashboardError = dashboardError || 'Could not capture the current context snapshot.'
      } else if (!loadout) {
        dashboardError = dashboardError || 'Claude Code did not return a context snapshot.'
      }
      redraw()
    }

    const refreshAgents = async () => {
      loadingAgents = true
      agentError = ''
      redraw()
      try {
        sessionAgents = await $.agent.list()
      } catch {
        sessionAgents = []
        agentError = 'Could not load agents for this Claude Code session.'
      } finally {
        loadingAgents = false
        redraw()
      }
    }

    const selected = workspaces.find((workspace) => workspace.path === selectedWorkspace) ?? {
      name: basename(currentDirectory),
      path: currentDirectory,
    }

    const openContext = async () => {
      activeTab = 'context'
      redraw()
      if (!loadout) await refreshLoadout('summary')
    }

    const sidebar = renderSidebar(ui, {
      activeTab,
      workspaces,
      selectedWorkspace,
      searchOpen,
      searchValue,
      redraw,
      onNewConversation: async () => {
        try {
          await $.command.run({ command: 'clear' })
        } catch {
          await $.ui.toast('Could not start a fresh conversation in this workspace.')
        }
      },
      onSearchOpen: () => {
        searchOpen = true
        redraw()
      },
      onSearchInput: (value) => {
        searchValue = value
        redraw()
      },
      onSearchSubmit: (value) => {
        searchValue = value
        searchOpen = false
        redraw()
      },
      onWorkspaceSelect: (workspace) => {
        selectedWorkspace = workspace.path
        activeTab = 'dashboard'
        redraw()
      },
      onTabSelect: async (tab) => {
        if (tab === 'context') return openContext()
        activeTab = tab
        if (tab === 'agents') {
          agentSubview = 'active'
          await refreshAgents()
        }
        redraw()
      },
    })

    let content: unknown
    if (activeTab === 'dashboard') {
      content = renderDashboard(ui, {
        selected,
        sessionAgents,
        contextSnapshots,
        loadout,
        dashboardError,
        onRefreshContext: refreshDashboardContext,
        onOpenContext: openContext,
      })
    } else if (activeTab === 'context') {
      content = renderContext(ui, {
        loadout,
        since,
        prompt: promptCapture(),
        subview: contextSubview,
        measuredAt,
        detail: loadoutDetail,
        loading: measuring,
        error: contextError,
        onRefresh: (detail) => void refreshLoadout(detail),
        onSubviewChange: (subview) => {
          contextSubview = subview
          redraw()
        },
      })
    } else {
      content = renderAgents(ui, {
        agentSubview,
        agentSearch,
        agentPrompt,
        sessionAgents,
        selectedAgentId,
        selectedWorkspace: selected,
        agentError,
        loadingAgents,
        launchingAgent,
        redraw,
        onSubviewChange: (subview) => {
          agentSubview = subview
          if (subview === 'active' || subview === 'inactive') agentSearch = ''
        },
        onAgentSearchInput: (value) => {
          agentSearch = value
          redraw()
        },
        onAgentSearchSubmit: (value) => {
          agentSearch = value
          redraw()
        },
        onRefreshAgents: refreshAgents,
        onSelectAgent: (agentId) => {
          selectedAgentId = agentId
          agentSubview = 'detail'
          redraw()
        },
        onAgentPromptInput: (value) => {
          agentPrompt = value
        },
        onAgentPromptSubmit: async (value) => {
          const task = value.trim()
          if (!task || launchingAgent) return
          launchingAgent = true
          redraw()
          try {
            const result = await $.agent.spawn({
              prompt: task,
              description: task.length > 64 ? `${task.slice(0, 61)}…` : task,
              cwd: selected.path,
            })
            if (result.deny) {
              await $.ui.toast(`Could not start agent: ${result.deny}`)
              return
            }
            agentPrompt = ''
            agentSubview = 'active'
            await refreshAgents()
            await $.ui.toast(`Agent started in ${selected.name}.`)
          } catch {
            await $.ui.toast(`Could not start an agent in ${selected.name}.`)
          } finally {
            launchingAgent = false
            redraw()
          }
        },
      })
    }

    return ui.Box({
      flexDirection: 'row',
      flexGrow: 1,
      columnGap: 1,
      children: [sidebar, content],
    })
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

/**
 * Lists sibling projects to pick from: CLAUDE_CODE_WORKSPACES_DIR when set,
 * else ~/programming, else the folder that holds the current project.
 */
async function discoverWorkspaces($: ModApi, currentDirectory: string): Promise<{ workspaces: Workspace[]; selectedWorkspace: string }> {
  const configuredRoot = (await $.env.get('CLAUDE_CODE_WORKSPACES_DIR'))?.trim()
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const roots = configuredRoot
    ? [configuredRoot]
    : [home ? joinPath(home, 'programming') : '', currentDirectory ? dirname(currentDirectory) : '']
  let workspaces: Workspace[] = []
  for (const root of roots.filter(Boolean)) {
    try {
      const entries = await $.fs.list(root)
      workspaces = entries
        .filter((entry) => entry.kind === 'directory' && !entry.isLink && !entry.name.startsWith('.'))
        .map((entry) => ({ name: entry.name, path: joinPath(root, entry.name) }))
      if (workspaces.length > 0) break
    } catch {
      // Missing or unreadable root: try the next candidate.
    }
  }
  const current = basename(currentDirectory)
  if (currentDirectory && !workspaces.some((workspace) => workspace.path === currentDirectory || workspace.name === current)) {
    workspaces.unshift({ name: current, path: currentDirectory })
  }
  workspaces.sort((left, right) => left.name.localeCompare(right.name))
  const selectedWorkspace = workspaces.find((workspace) => workspace.path === currentDirectory)?.path
    ?? workspaces.find((workspace) => workspace.name === current)?.path
    ?? workspaces[0]?.path
    ?? currentDirectory
  return { workspaces, selectedWorkspace }
}
