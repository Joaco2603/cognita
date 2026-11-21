import {
  estimateTokens,
  meter,
  pluginSections,
  share,
  shortPath,
  type Loadout,
  type PromptCapture,
} from './loadout.js'
import { formatTokenCount, formatTokensShort, slug, type ContextSubview } from './utils.js'

const ACCENT = '#D97757'
const BORDER = '#343746'
const WARN = '#F2B84B'
const ERROR = '#F87171'
const MAX_ROWS = 12

export function renderContext(ui: UiComponents, options: {
  loadout?: Loadout
  prompt?: PromptCapture
  subview: ContextSubview
  measuredAt: string
  detail: 'summary' | 'full'
  loading: boolean
  error: string
  onRefresh: (detail: 'summary' | 'full') => void
  onSubviewChange: (subview: ContextSubview) => void
}): unknown {
  const { Box, Button, Text } = ui

  const row = (key: string, label: string, value: string, extra?: string, color?: string) =>
    Box({
      key,
      flexDirection: 'row',
      columnGap: 1,
      children: [
        Box({ flexGrow: 1, flexShrink: 1, children: [Text({ children: [label], wrap: 'truncate-middle', color })] }),
        Text({ children: [value], bold: true, color }),
        extra === undefined ? null : Text({ children: [extra.padStart(4)], dimColor: true }),
      ],
    })

  const heading = (text: string) => Text({ children: [text], dimColor: true, bold: true })
  const more = (count: number) =>
    count > MAX_ROWS ? Text({ children: [`… ${count - MAX_ROWS} more (see /inspector report)`], dimColor: true }) : null

  const menuButton = (subview: ContextSubview, label: string, hotkey: string) =>
    Button({
      key: `context-menu-${subview}`,
      label: `${options.subview === subview ? '▸ ' : '  '}${label}`,
      hotkey,
      plain: true,
      dimColor: options.subview !== subview,
      onPress: () => options.onSubviewChange(subview),
    })

  const toolbar = Box({
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 2,
    children: [
      menuButton('overview', 'Overview', 'o'),
      menuButton('memory', 'Files', 'm'),
      menuButton('mcp', 'MCP', 'p'),
      menuButton('skills', 'Skills', 's'),
      menuButton('prompt', 'Prompt', 'y'),
    ],
  })

  const actions = Box({
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 2,
    children: [
      Button({
        key: 'context-refresh',
        label: options.loading ? '↻ Measuring…' : '↻ Measure',
        hotkey: 'r',
        plain: true,
        onPress: () => options.onRefresh('summary'),
      }),
      Button({
        key: 'context-refresh-full',
        label: '◎ Exact count',
        hotkey: 'x',
        plain: true,
        dimColor: true,
        onPress: () => options.onRefresh('full'),
      }),
    ],
  })

  const loadout = options.loadout
  if (!loadout) {
    return Box({
      key: 'context-panel',
      flexDirection: 'column',
      flexGrow: 1,
      rowGap: 1,
      padding: 1,
      borderStyle: 'round',
      borderColor: BORDER,
      children: [
        Text({ children: ['CONTEXT LOADOUT'], bold: true, color: ACCENT }),
        Text({ children: ['See what this session has loaded into its context window: instruction files, MCP tools, skills, agents and system prompt sections.'] }),
        options.loading
          ? Text({ children: ['Measuring the context window…'], dimColor: true })
          : Text({ children: ['Press r to measure (local estimate) or x for an exact token count.'], dimColor: true }),
        actions,
        options.error ? Box({ key: 'context-error', children: [Text({ children: [options.error], color: ERROR })] }) : null,
      ],
    })
  }

  const percent = Math.round(loadout.percentage)
  const header = Box({
    key: 'context-header',
    flexDirection: 'column',
    children: [
      Box({
        flexDirection: 'row',
        columnGap: 1,
        children: [
          Text({ children: ['CONTEXT LOADOUT'], bold: true, color: ACCENT }),
          Text({ children: [`${loadout.model}`], dimColor: true, wrap: 'truncate-end' }),
        ],
      }),
      Box({
        key: 'context-meter',
        children: [Text({
          children: [`${meter(loadout.percentage, 24)} ${percent}%`],
          color: percent >= 80 ? ERROR : percent >= 60 ? WARN : ACCENT,
        })],
      }),
      Text({
        children: [`${formatTokenCount(loadout.totalTokens)} / ${formatTokenCount(loadout.maxTokens)} tokens · ${formatTokensShort(loadout.freeTokens)} free · ${options.detail === 'full' ? 'exact' : 'estimated'} at ${options.measuredAt}`],
        dimColor: true,
      }),
    ],
  })

  let body: unknown[]
  switch (options.subview) {
    case 'memory':
      body = [
        heading(`INSTRUCTION FILES · ${loadout.memoryFiles.length}`),
        ...loadout.memoryFiles.slice(0, MAX_ROWS).map((file) =>
          row(`context-file-${slug(file.path)}`, `${shortPath(file.path)} (${file.type})`, formatTokensShort(file.tokens), share(file.tokens, loadout.totalTokens))),
        loadout.memoryFiles.length === 0 ? Text({ children: ['No CLAUDE.md or memory files are loaded.'], dimColor: true }) : null,
        more(loadout.memoryFiles.length),
      ]
      break
    case 'mcp':
      body = [
        heading(`MCP SERVERS · ${loadout.mcpServers.length}  (tokens · loaded/tools · calls)`),
        ...loadout.mcpServers.slice(0, MAX_ROWS).map((server) =>
          row(
            `context-mcp-${slug(server.server)}`,
            `${server.server}  ${server.loadedTools}/${server.tools} · ${server.calls} calls`,
            formatTokensShort(server.tokens),
            share(server.tokens, loadout.totalTokens),
            server.calls === 0 && server.tokens > 0 ? WARN : undefined,
          )),
        loadout.mcpServers.length === 0 ? Text({ children: ['No MCP servers are connected.'], dimColor: true }) : null,
        more(loadout.mcpServers.length),
        Text({ children: ['Deferred tools cost nothing until ToolSearch loads them.'], dimColor: true }),
      ]
      break
    case 'skills':
      body = [
        heading(`SKILLS · ${loadout.skills.length}  (tokens · uses)`),
        ...loadout.skills.slice(0, MAX_ROWS).map((skill) =>
          row(
            `context-skill-${slug(skill.name)}`,
            `${skill.name}  ${skill.uses} uses`,
            formatTokensShort(skill.tokens),
            skill.pluginName ?? skill.source,
            skill.uses === 0 && skill.tokens > 0 ? WARN : undefined,
          )),
        loadout.skills.length === 0 ? Text({ children: ['No skills are listed in the prompt.'], dimColor: true }) : null,
        more(loadout.skills.length),
        loadout.skillGroups.length > 1 ? heading(`BY SOURCE · ${loadout.skillGroups.length}`) : null,
        ...(loadout.skillGroups.length > 1 ? loadout.skillGroups.slice(0, 6) : []).map((group) =>
          row(
            `context-skill-source-${slug(group.source)}`,
            `${group.source}  ${group.skills} skills · ${group.uses} uses`,
            formatTokensShort(group.tokens),
            share(group.tokens, loadout.totalTokens),
            group.uses === 0 ? WARN : undefined,
          )),
        loadout.agents.length > 0 ? heading(`CUSTOM AGENTS · ${loadout.agents.length}`) : null,
        ...loadout.agents.slice(0, 6).map((agent) =>
          row(`context-agent-${slug(agent.agentType)}`, agent.agentType, formatTokensShort(agent.tokens), agent.source)),
        loadout.slashCommands
          ? Text({ children: [`Slash commands: ${loadout.slashCommands.includedCommands}/${loadout.slashCommands.totalCommands} listed · ${formatTokensShort(loadout.slashCommands.tokens)} tokens`], dimColor: true })
          : null,
      ]
      break
    case 'prompt': {
      const sections = options.prompt?.sections ?? []
      const added = options.prompt ? pluginSections(options.prompt) : []
      body = sections.length === 0
        ? [
            heading('SYSTEM PROMPT SECTIONS'),
            Text({ children: ['No system prompt captured yet. It is recorded the next time Claude Code composes one (send a message, or press x).'], dimColor: true }),
          ]
        : [
            heading(`SYSTEM PROMPT SECTIONS · ${sections.length}  (≈ tokens · cache side)`),
            ...[...sections].sort((left, right) => right.chars - left.chars).slice(0, MAX_ROWS).map((section) =>
              row(
                `context-section-${slug(section.id)}`,
                section.id,
                formatTokensShort(estimateTokens(section.chars)),
                section.scope,
                section.id.includes(':') ? ACCENT : undefined,
              )),
            more(sections.length),
            added.length > 0
              ? Text({ children: [`${added.length} section(s) added by plugins (highlighted).`], color: ACCENT })
              : null,
            ...(options.prompt?.blocks.length
              ? [
                  heading('FIRST MESSAGE CONTEXT'),
                  ...options.prompt.blocks.map((block) =>
                    row(`context-block-${slug(block.name)}`, block.name, formatTokensShort(estimateTokens(block.chars)))),
                ]
              : []),
          ]
      break
    }
    default:
      body = [
        heading('WHAT FILLS THE WINDOW'),
        ...loadout.categories.slice(0, MAX_ROWS).map((category) =>
          row(
            `context-category-${slug(category.name)}`,
            category.name,
            formatTokensShort(category.tokens),
            share(category.tokens, loadout.maxTokens),
          )),
        loadout.deferredTokens > 0
          ? Text({ children: [`+ ${formatTokensShort(loadout.deferredTokens)} deferred (outside the window until loaded)`], dimColor: true })
          : null,
        heading('BIGGEST LEVERS'),
        loadout.levers.length === 0
          ? Text({ children: ['Nothing stands out yet.'], dimColor: true })
          : null,
        ...loadout.levers.slice(0, 3).map((lever) =>
          row(`context-lever-${slug(lever.key)}`, lever.text.replaceAll('`', ''), `-${formatTokensShort(lever.tokens)}`, undefined, WARN)),
        heading('LOADED BUT UNUSED THIS SESSION'),
        loadout.idle.length === 0
          ? Box({ key: 'context-idle-none', children: [Text({ children: ['Everything loaded has been used at least once.'], dimColor: true })] })
          : Text({
              key: 'context-idle-total',
              children: [`${formatTokenCount(loadout.idleTokens)} tokens on ${loadout.idle.length} unused item(s)`],
              color: WARN,
            }),
        ...loadout.idle.slice(0, 5).map((item) =>
          row(`context-idle-${item.kind}-${slug(item.name)}`, `${item.kind === 'mcp' ? 'MCP' : 'skill'} · ${item.name}`, formatTokensShort(item.tokens), undefined, WARN)),
      ]
  }

  return Box({
    key: 'context-panel',
    flexDirection: 'column',
    flexGrow: 1,
    rowGap: 1,
    padding: 1,
    borderStyle: 'round',
    borderColor: BORDER,
    children: [
      header,
      toolbar,
      Box({ flexDirection: 'column', children: body }),
      actions,
      options.error ? Box({ key: 'context-error', children: [Text({ children: [options.error], color: ERROR })] }) : null,
    ],
  })
}
