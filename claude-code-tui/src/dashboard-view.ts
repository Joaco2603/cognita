import { formatTokenCount, type DashboardTab, type Workspace } from './utils.js'

export function renderSidebar(ui: UiComponents, options: {
  activeTab: DashboardTab
  workspaces: Workspace[]
  selectedWorkspace: string
  searchOpen: boolean
  searchValue: string
  redraw: () => void
  onNewConversation: () => void
  onSearchOpen: () => void
  onSearchInput: (value: string) => void
  onSearchSubmit: (value: string) => void
  onWorkspaceSelect: (workspace: Workspace) => void
  onTabSelect: (tab: DashboardTab) => Promise<void>
}): unknown {
  const { Box, Button, Input, Text } = ui
  const filteredWorkspaces = options.workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(options.searchValue.trim().toLowerCase()),
  )

  const workspaceButtons = filteredWorkspaces.map((workspace, index) =>
    Button({
      key: `workspace-${workspace.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`,
      label: `${options.selectedWorkspace === workspace.path ? '▸ ' : '  '}${workspace.name}`,
      hotkey: index === 0 ? 'w' : undefined,
      plain: true,
      dimColor: options.selectedWorkspace !== workspace.path,
      onPress: () => options.onWorkspaceSelect(workspace),
    }),
  )

  const tabButton = (tab: DashboardTab, label: string, hotkey: string) =>
    Button({
      key: `tab-${tab}`,
      label: `${options.activeTab === tab ? '▸ ' : '  '}${label}`,
      hotkey,
      plain: true,
      dimColor: options.activeTab !== tab,
      onPress: () => options.onTabSelect(tab),
    })

  return Box({
    flexDirection: 'column',
    width: 27,
    rowGap: 1,
    padding: 1,
    borderStyle: 'round',
    borderColor: '#343746',
    children: [
      Text({ children: ['✳ Claude Code'], bold: true, color: '#D97757' }),
      Button({
        key: 'action-new',
        label: '＋  New conversation',
        hotkey: 'n',
        plain: true,
        onPress: options.onNewConversation,
      }),
      options.searchOpen
        ? Input({
            key: 'workspace-search',
            label: 'Search',
            placeholder: 'Search workspaces',
            value: options.searchValue,
            autoFocus: true,
            onInput: options.onSearchInput,
            onSubmit: options.onSearchSubmit,
          })
        : Button({
            key: 'action-search',
            label: '⌕  Search',
            hotkey: 'f',
            plain: true,
            onPress: options.onSearchOpen,
          }),
      Text({ children: ['WORKSPACES'], dimColor: true, bold: true }),
      ...workspaceButtons,
      Text({ children: ['NAVIGATE'], dimColor: true, bold: true }),
      tabButton('dashboard', 'Dashboard', '1'),
      tabButton('agents', 'Agents', '2'),
    ],
  })
}

export function renderDashboard(ui: UiComponents, options: {
  selected: Workspace
  sessionAgents: AgentInfo[]
  contextSnapshots: Array<{ capturedAt: string; text: string }>
  dashboardError: string
  onRefreshContext: () => void
}): unknown {
  const { Box, Button, Text } = ui
  const totalSubagentTokens = options.sessionAgents.reduce(
    (total, agent) => total + (Number.isFinite(agent.tokenCount) ? agent.tokenCount : 0),
    0,
  )

  return Box({
    flexDirection: 'column',
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    rowGap: 1,
    children: [
      Text({ children: ['  ·    ·'], color: '#D97757' }),
      Text({ children: ['·   ✳   ·'], color: '#D97757', bold: true }),
      Text({ children: ['  ·    ·'], color: '#D97757' }),
      Text({ children: ['Welcome back, Joaquin'], bold: true }),
      Text({ children: ['What would you like to work on?'] }),
      Box({
        key: 'selected-workspace-card',
        flexDirection: 'column',
        rowGap: 1,
        padding: 1,
        width: 42,
        borderStyle: 'round',
        borderColor: '#D97757',
        children: [
          Text({ children: ['SELECTED WORKSPACE'], dimColor: true, bold: true }),
          Text({ children: [options.selected.name], bold: true }),
          Text({ children: [options.selected.path], dimColor: true }),
        ],
      }),
      Box({
        key: 'context-overview-card',
        flexDirection: 'column',
        rowGap: 1,
        padding: 1,
        width: 52,
        borderStyle: 'round',
        borderColor: '#343746',
        children: [
          Text({ children: ['CONTEXT OVERVIEW'], bold: true }),
          Text({ children: [`${formatTokenCount(totalSubagentTokens)} tracked subagent tokens · ${options.sessionAgents.length} agents`] }),
          Button({
            key: 'dashboard-stats-refresh',
            label: '↻ Refresh context snapshot',
            plain: true,
            onPress: options.onRefreshContext,
          }),
          options.contextSnapshots.length > 0
            ? Text({ children: [options.contextSnapshots.at(-1)!.text], dimColor: true })
            : Text({ children: ['Refresh to capture current /context usage.'], dimColor: true }),
          options.dashboardError ? Text({ children: [options.dashboardError], color: '#F87171' }) : null,
        ],
      }),
    ],
  })
}
