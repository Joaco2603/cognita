import { basename, formatTokenCount, isActiveAgent, type AgentSubview, type Workspace } from './utils.js'

export function renderAgents(ui: UiComponents, options: {
  agentSubview: AgentSubview
  agentSearch: string
  agentPrompt: string
  sessionAgents: AgentInfo[]
  selectedAgentId: string
  selectedWorkspace: Workspace
  agentError: string
  loadingAgents: boolean
  launchingAgent: boolean
  redraw: () => void
  onSubviewChange: (subview: AgentSubview) => void | Promise<void>
  onAgentSearchInput: (value: string) => void
  onAgentSearchSubmit: (value: string) => void
  onRefreshAgents: () => void | Promise<void>
  onSelectAgent: (agentId: string) => void
  onAgentPromptInput: (value: string) => void
  onAgentPromptSubmit: (value: string) => void | Promise<void>
}): unknown {
  const { Box, Button, Input, Text } = ui

  const agentMenu = Box({
    flexDirection: 'row',
    columnGap: 1,
    children: [
      Button({
        key: 'agents-menu-running',
        label: `${options.agentSubview === 'active' ? '▸ ' : ''}Active agents`,
        plain: true,
        dimColor: options.agentSubview !== 'active',
        onPress: () => {
          options.onSubviewChange('active')
          options.redraw()
        },
      }),
      Button({
        key: 'agents-menu-inactive',
        label: `${options.agentSubview === 'inactive' ? '▸ ' : ''}Inactive agents`,
        plain: true,
        dimColor: options.agentSubview !== 'inactive',
        onPress: () => {
          options.onSubviewChange('inactive')
          options.redraw()
        },
      }),
      Button({
        key: 'agents-menu-launch',
        label: `${options.agentSubview === 'launch' ? '▸ ' : ''}＋ New agent`,
        plain: true,
        dimColor: options.agentSubview !== 'launch',
        onPress: () => {
          options.onSubviewChange('launch')
          options.redraw()
        },
      }),
    ],
  })

  const visibleAgents = options.sessionAgents
    .filter((agent) => isActiveAgent(agent) === (options.agentSubview === 'active'))
    .filter((agent) => `${agent.name ?? ''} ${agent.description} ${agent.label}`
      .toLowerCase()
      .includes(options.agentSearch.trim().toLowerCase()))

  const agentCards = visibleAgents.map((agent) =>
    Box({
      key: `agent-card-container-${agent.id}`,
      flexDirection: 'column',
      rowGap: 1,
      padding: 1,
      width: 36,
      minHeight: 7,
      borderStyle: 'round',
      borderColor: agent.taskStatus === 'running' ? '#34D399' : '#6366F1',
      children: [
        Button({
          key: `agent-card-${agent.id}`,
          label: `● ${agent.taskStatus.toUpperCase()} · ${agent.name ?? agent.description}`,
          plain: true,
          onPress: () => options.onSelectAgent(agent.id),
        }),
        Text({ children: [agent.label || agent.description], dimColor: true }),
        Text({ children: [basename(agent.cwd)], dimColor: true }),
      ],
    }),
  )

  const agentList = Box({
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    children: [
      Box({
        flexDirection: 'row',
        justifyContent: 'space-between',
        children: [
          Text({
            children: [`${options.agentSubview === 'inactive' ? 'INACTIVE' : 'ACTIVE'} AGENTS · ${visibleAgents.length}`],
            bold: true,
          }),
          Button({
            key: 'agents-refresh',
            label: options.loadingAgents ? 'Refreshing…' : '↻ Refresh',
            plain: true,
            onPress: options.onRefreshAgents,
          }),
        ],
      }),
      Input({
        key: 'agent-search',
        label: 'Search agents',
        placeholder: `Search ${options.agentSubview} agents`,
        value: options.agentSearch,
        onInput: options.onAgentSearchInput,
        onSubmit: options.onAgentSearchSubmit,
      }),
      options.agentError
        ? Text({ children: [options.agentError], color: '#F87171' })
        : visibleAgents.length === 0
          ? Text({ children: [`No ${options.agentSubview} agents match this search.`] })
          : Box({ flexDirection: 'row', flexWrap: 'wrap', gap: 1, children: agentCards }),
    ],
  })

  const selectedAgent = options.sessionAgents.find((agent) => agent.id === options.selectedAgentId)
  const agentDetail = Box({
    key: 'agent-detail',
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    children: selectedAgent
      ? [
          Button({
            key: 'agent-detail-back',
            label: '‹ Back to agents',
            plain: true,
            onPress: () => {
              options.onSubviewChange(isActiveAgent(selectedAgent) ? 'active' : 'inactive')
              options.redraw()
            },
          }),
          Text({ children: [selectedAgent.name ?? selectedAgent.description], bold: true }),
          Text({ children: [`${selectedAgent.type} · ${selectedAgent.taskStatus} · ${basename(selectedAgent.cwd)}`], dimColor: true }),
          Text({ children: ['CONTEXT HISTORY'], bold: true, color: '#D97757' }),
          Button({
            key: 'agent-detail-refresh',
            label: options.loadingAgents ? 'Refreshing…' : '↻ Refresh history',
            plain: true,
            onPress: options.onRefreshAgents,
          }),
          Text({ children: [`${formatTokenCount(selectedAgent.tokenCount)} tokens currently reported`] }),
          (selectedAgent.tokenSamples ?? []).length > 0
            ? Text({ children: [`Token samples: ${selectedAgent.tokenSamples.map(formatTokenCount).join(' → ')}`] })
            : Text({ children: ['No token history samples are available for this agent.'], dimColor: true }),
          Text({ children: [selectedAgent.label || selectedAgent.description] }),
          Text({ children: ['Full prompt history and skill-use events are not exposed by this plugin API.'], dimColor: true }),
        ]
      : [Text({ children: ['Select an agent to inspect its context history.'] })],
  })

  const launchContent = Box({
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    children: [
      Text({ children: ['NEW AGENT'], bold: true }),
      Box({
        key: 'agent-target-card',
        flexDirection: 'column',
        padding: 1,
        rowGap: 1,
        borderStyle: 'round',
        borderColor: '#6366F1',
        children: [
          Text({ children: ['RUN IN WORKSPACE'], dimColor: true, bold: true }),
          Text({ children: [options.selectedWorkspace.name], bold: true }),
          Text({ children: [options.selectedWorkspace.path], dimColor: true }),
        ],
      }),
      Text({ children: ['Describe the task for your agent.'] }),
      Input({
        key: 'agent-prompt',
        label: 'Task',
        placeholder: 'e.g. Review the latest changes and report issues',
        value: options.agentPrompt,
        autoFocus: true,
        onInput: options.onAgentPromptInput,
        onSubmit: options.onAgentPromptSubmit,
      }),
      Text({ children: [options.launchingAgent ? 'Starting agent…' : 'Press Enter to launch · Esc to cancel'], dimColor: true }),
    ],
  })

  return Box({
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    children: [
      Text({ children: ['AGENTS'], bold: true, color: '#D97757' }),
      agentMenu,
      Box({
        flexDirection: 'column',
        flexGrow: 1,
        rowGap: 1,
        padding: 1,
        borderStyle: 'round',
        borderColor: '#343746',
        children: [
          options.agentSubview === 'detail'
            ? agentDetail
            : options.agentSubview === 'launch'
              ? launchContent
              : agentList,
        ],
      }),
    ],
  })
}
