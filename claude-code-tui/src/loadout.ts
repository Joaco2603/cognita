// Pure analysis of what a Claude Code session has loaded into its context
// window. No engine calls here, so it is unit-tested directly.

import { basename, formatTokenCount } from './utils.js'

/** What the plugin has seen the session actually use, keyed by name. */
export type UsageLog = {
  tools: Record<string, number>
  skills: Record<string, number>
}

/** A system prompt section as last composed, measured by length. */
export type PromptSectionSize = {
  id: string
  scope: 'shared' | 'session'
  chars: number
}

export type PromptContextSize = {
  name: string
  chars: number
}

export type PromptCapture = {
  sections: PromptSectionSize[]
  blocks: PromptContextSize[]
  instructionFiles: Array<{ path: string; kind: string; chars: number }>
}

export type McpServerLoad = {
  server: string
  tokens: number
  tools: number
  loadedTools: number
  calls: number
}

export type SkillLoad = {
  name: string
  source: string
  pluginName?: string
  tokens: number
  uses: number
}

export type IdleItem = {
  kind: 'mcp' | 'skill'
  name: string
  tokens: number
}

/** Skills grouped by where they come from: a plugin, user settings, built-in. */
export type SkillGroup = {
  source: string
  skills: number
  tokens: number
  uses: number
}

/** One concrete change that would free context, with its saving. */
export type Lever = {
  key: string
  text: string
  tokens: number
}

export type Loadout = {
  model: string
  totalTokens: number
  maxTokens: number
  percentage: number
  freeTokens: number
  bufferTokens: number
  /** Categories that occupy the window now. */
  categories: Array<{ name: string; tokens: number }>
  /** Listed but deferred: outside the window until something loads them. */
  deferred: Array<{ name: string; tokens: number }>
  deferredTokens: number
  memoryFiles: Array<{ path: string; type: string; tokens: number }>
  mcpServers: McpServerLoad[]
  skills: SkillLoad[]
  skillGroups: SkillGroup[]
  agents: ContextAgent[]
  slashCommands?: { totalCommands: number; includedCommands: number; tokens: number }
  idle: IdleItem[]
  idleTokens: number
  levers: Lever[]
}

export function emptyUsage(): UsageLog {
  return { tools: {}, skills: {} }
}

/** Roughly 4 characters per token, the same rule of thumb /context uses offline. */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

/** Skills are counted by `recordSkillUse` from `skill.prompt`, which also sees slash-command use. */
export function recordToolCall(usage: UsageLog, tool: string): void {
  usage.tools[tool] = (usage.tools[tool] ?? 0) + 1
}

export function recordSkillUse(usage: UsageLog, skill: string): void {
  usage.skills[skill] = (usage.skills[skill] ?? 0) + 1
}

/** MCP tool ids are `mcp__<server>__<tool>`; anything else has no server. */
export function mcpServerOf(tool: string): string | undefined {
  if (!tool.startsWith('mcp__')) return undefined
  return tool.slice(5).split('__')[0] || undefined
}

function skillUses(usage: UsageLog, skill: ContextSkill): number {
  const plugin = skill.pluginName
  return (usage.skills[skill.name] ?? 0)
    + (plugin && !skill.name.includes(':') ? usage.skills[`${plugin}:${skill.name}`] ?? 0 : 0)
}

export function summarize(breakdown: SessionContextBreakdown, usage: UsageLog): Loadout {
  const byTokens = <T extends { tokens: number }>(left: T, right: T) => right.tokens - left.tokens

  const isDeferred = (category: ContextCategory) => category.kind === 'deferred' || category.isDeferred
  const categories = breakdown.categories
    .filter((category) => category.kind === 'used' && !isDeferred(category))
    .map(({ name, tokens }) => ({ name, tokens }))
    .sort(byTokens)
  const deferred = breakdown.categories
    .filter((category) => (category.kind === 'used' || category.kind === 'deferred') && isDeferred(category))
    .map(({ name, tokens }) => ({ name: name.replace(/\s*\(deferred\)\s*$/i, ''), tokens }))
    .sort(byTokens)
  const freeTokens = breakdown.categories
    .filter((category) => category.kind === 'free')
    .reduce((total, category) => total + category.tokens, 0)
  const bufferTokens = breakdown.categories
    .filter((category) => category.kind === 'buffer')
    .reduce((total, category) => total + category.tokens, 0)

  const servers = new Map<string, McpServerLoad>()
  for (const tool of breakdown.mcpTools) {
    const server = servers.get(tool.serverName) ?? {
      server: tool.serverName,
      tokens: 0,
      tools: 0,
      loadedTools: 0,
      calls: 0,
    }
    server.tokens += tool.isLoaded ? tool.tokens : 0
    server.tools += 1
    server.loadedTools += tool.isLoaded ? 1 : 0
    server.calls += usage.tools[tool.name] ?? 0
    servers.set(tool.serverName, server)
  }
  const mcpServers = [...servers.values()].sort((left, right) =>
    right.tokens - left.tokens || right.tools - left.tools || left.server.localeCompare(right.server),
  )

  const skills = (breakdown.skills?.skillFrontmatter ?? [])
    .map((skill) => ({
      name: skill.name,
      source: skill.source,
      pluginName: skill.pluginName,
      tokens: skill.tokens,
      uses: skillUses(usage, skill),
    }))
    .sort(byTokens)

  const groups = new Map<string, SkillGroup>()
  for (const skill of skills) {
    const source = skillSource(skill)
    const group = groups.get(source) ?? { source, skills: 0, tokens: 0, uses: 0 }
    group.skills += 1
    group.tokens += skill.tokens
    group.uses += skill.uses
    groups.set(source, group)
  }
  const skillGroups = [...groups.values()].sort(byTokens)

  const idle: IdleItem[] = [
    ...mcpServers
      .filter((server) => server.calls === 0 && server.tokens > 0)
      .map((server) => ({ kind: 'mcp' as const, name: server.server, tokens: server.tokens })),
    ...skills
      .filter((skill) => skill.uses === 0 && skill.tokens > 0)
      .map((skill) => ({ kind: 'skill' as const, name: skill.name, tokens: skill.tokens })),
  ].sort(byTokens)

  const memoryFiles = [...breakdown.memoryFiles].sort(byTokens)
  const idleTokens = idle.reduce((total, item) => total + item.tokens, 0)

  return {
    model: breakdown.model,
    totalTokens: breakdown.totalTokens,
    maxTokens: breakdown.maxTokens,
    percentage: breakdown.percentage,
    freeTokens,
    bufferTokens,
    categories,
    deferred,
    deferredTokens: deferred.reduce((total, category) => total + category.tokens, 0),
    memoryFiles,
    mcpServers,
    skills,
    skillGroups,
    agents: [...breakdown.agents].sort(byTokens),
    slashCommands: breakdown.slashCommands,
    idle,
    idleTokens,
    levers: findLevers(mcpServers, skillGroups, memoryFiles),
  }
}

/** Plugin skills group under "plugin <name>"; others under their settings source. */
export function skillSource(skill: { source: string; pluginName?: string }): string {
  return skill.pluginName ? `plugin ${skill.pluginName}` : skill.source
}

/** Instruction files at or above this size are worth trimming or moving into a skill. */
export const LARGE_INSTRUCTION_FILE = 2000

/** Savings below this are noise next to a 200k window, so they are not suggested. */
export const MIN_LEVER_TOKENS = 200

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** The few changes that would free the most context, biggest first. */
export function findLevers(
  mcpServers: readonly McpServerLoad[],
  skillGroups: readonly SkillGroup[],
  memoryFiles: ReadonlyArray<{ path: string; tokens: number }>,
  limit = 5,
): Lever[] {
  const code = (text: string) => '`' + text + '`'
  const levers: Lever[] = [
    ...mcpServers
      .filter((server) => server.calls === 0 && server.tokens > 0)
      .map((server) => ({
        key: `mcp-${server.server}`,
        text: `Disable MCP server ${code(server.server)} for this project (${plural(server.loadedTools, 'loaded tool')}, no calls)`,
        tokens: server.tokens,
      })),
    ...skillGroups
      .filter((group) => group.source.startsWith('plugin ') && group.uses === 0 && group.tokens > 0)
      .map((group) => ({
        key: `skills-${group.source}`,
        text: `Disable plugin ${code(group.source.slice('plugin '.length))} (${plural(group.skills, 'skill')}, none used)`,
        tokens: group.tokens,
      })),
    ...memoryFiles
      .filter((file) => file.tokens >= LARGE_INSTRUCTION_FILE)
      .map((file) => ({
        key: `file-${file.path}`,
        text: `Trim ${code(shortPath(file.path))} or move rarely needed parts into a skill (it loads every turn)`,
        tokens: file.tokens,
      })),
  ]
  return levers.filter((lever) => lever.tokens >= MIN_LEVER_TOKENS).sort((left, right) => right.tokens - left.tokens).slice(0, limit)
}

export function measurePrompt(
  sections: readonly PromptComposeSection[],
  blocks: readonly PromptContextBlock[],
  instructionFiles: readonly InstructionFile[] = [],
): PromptCapture {
  return {
    sections: sections.map((section) => ({ id: section.id, scope: section.scope, chars: section.text.length })),
    blocks: blocks.map((block) => ({ name: block.name, chars: block.text.length })),
    instructionFiles: instructionFiles.map((file) => ({ path: file.path, kind: file.kind, chars: file.content.length })),
  }
}

/** Sections a plugin added to the system prompt carry a `<plugin>:<name>` id. */
export function pluginSections(capture: PromptCapture): PromptSectionSize[] {
  return capture.sections.filter((section) => section.id.includes(':'))
}

/** `[████░░░░]` meter for a 0 to 100 percentage. */
export function meter(percent: number, width = 20): string {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0))
  const filled = Math.round((clamped / 100) * width)
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`
}

export function share(tokens: number, total: number): string {
  if (total <= 0) return '0%'
  const percent = (tokens / total) * 100
  return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`
}

function table(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return ['_None._']
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`),
  ]
}

/** Long lists in the report stop here; the pane and the totals keep everything. */
export const REPORT_ROWS = 15

/** Markdown report for `/inspector report`: paste-able into an issue or PR. */
export function formatReport(
  loadout: Loadout,
  prompt: PromptCapture | undefined,
  usage: UsageLog,
  since?: LoadoutDiff | 'first',
): string {
  const tokens = formatTokenCount
  const lines: string[] = [
    '## Session loadout',
    '',
    `Model \`${loadout.model}\` · ${tokens(loadout.totalTokens)} / ${tokens(loadout.maxTokens)} tokens (${Math.round(loadout.percentage)}%) · ${tokens(loadout.freeTokens)} free`,
    '',
    '### Biggest levers',
    '',
    ...(loadout.levers.length === 0
      ? ['Nothing stands out: every loaded MCP server and plugin has been used, and no instruction file is large.']
      : loadout.levers.map((lever) => `- ${lever.text}: frees ~${tokens(lever.tokens)} tokens`)),
    ...(since === undefined ? [] : ['', '### Since last session', '', ...formatDiff(since === 'first' ? undefined : since)]),
    '',
    '### Context window',
    '',
    ...table(
      ['Category', 'Tokens', 'Share'],
      loadout.categories.map((category) => [
        category.name,
        tokens(category.tokens),
        share(category.tokens, loadout.maxTokens),
      ]),
    ),
    ...(loadout.deferredTokens > 0
      ? ['', `Deferred, outside the window until loaded: ${loadout.deferred.map((category) => `${category.name} ${tokens(category.tokens)}`).join(', ')}.`]
      : []),
    '',
    '### Instruction files (CLAUDE.md, rules, memory)',
    '',
    ...table(
      ['File', 'Type', 'Tokens'],
      loadout.memoryFiles.map((file) => [file.path, file.type, tokens(file.tokens)]),
    ),
    '',
    '### MCP servers',
    '',
    ...table(
      ['Server', 'Tools loaded / total', 'Tokens', 'Calls this session'],
      loadout.mcpServers.map((server) => [
        server.server,
        `${server.loadedTools} / ${server.tools}`,
        tokens(server.tokens),
        String(server.calls),
      ]),
    ),
    '',
    '### Skills by source',
    '',
    ...table(
      ['Source', 'Skills', 'Tokens', 'Uses'],
      loadout.skillGroups.map((group) => [group.source, String(group.skills), tokens(group.tokens), String(group.uses)]),
    ),
    '',
    `### Heaviest skills${loadout.skills.length > REPORT_ROWS ? ` (top ${REPORT_ROWS} of ${loadout.skills.length})` : ''}`,
    '',
    ...table(
      ['Skill', 'Source', 'Tokens', 'Uses'],
      loadout.skills.slice(0, REPORT_ROWS).map((skill) => [
        skill.name,
        skill.pluginName ? `${skill.source} (${skill.pluginName})` : skill.source,
        tokens(skill.tokens),
        String(skill.uses),
      ]),
    ),
  ]

  if (loadout.agents.length > 0) {
    lines.push('', '### Custom agents', '', ...table(
      ['Agent', 'Source', 'Tokens'],
      loadout.agents.map((agent) => [agent.agentType, agent.source, tokens(agent.tokens)]),
    ))
  }

  if (prompt && prompt.sections.length > 0) {
    lines.push('', '### System prompt sections (last composed)', '', ...table(
      ['Section', 'Scope', '≈ Tokens'],
      prompt.sections.map((section) => [section.id, section.scope, tokens(estimateTokens(section.chars))]),
    ))
  }

  lines.push('', '### Loaded but unused this session', '')
  if (loadout.idle.length === 0) {
    lines.push('Everything loaded has been used at least once.')
  } else {
    lines.push(
      `${tokens(loadout.idleTokens)} tokens are spent on items not used yet. Consider disabling them for this project:`,
      '',
      ...loadout.idle.slice(0, REPORT_ROWS).map((item) => `- ${item.kind === 'mcp' ? 'MCP server' : 'Skill'} \`${item.name}\`: ${tokens(item.tokens)} tokens`),
    )
  }

  const rest = loadout.idle.slice(REPORT_ROWS)
  if (rest.length > 0) {
    lines.push(`- …and ${rest.length} more (${tokens(rest.reduce((total, item) => total + item.tokens, 0))} tokens)`)
  }

  const toolCalls = Object.values(usage.tools).reduce((total, count) => total + count, 0)
  lines.push('', `_${toolCalls} tool calls observed since the plugin loaded._`)
  return lines.join('\n')
}

/** Short label for a memory file path: its last two segments. */
export function shortPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}` || basename(path)
}

/** What a session loads before any message, kept across sessions to compare against. */
export type LoadoutSnapshot = {
  shape: 'loadout-1'
  sessionId: string
  at: string
  model: string
  /** Tokens loaded before any conversation: every category but Messages. */
  baseTokens: number
  /** `category:<name>`, `mcp:<server>`, `skills:<source>`, `file:<path>` to tokens. */
  items: Record<string, number>
}

/** The store's record for one project: this session's snapshot and the one before. */
export type LoadoutHistory = {
  current: LoadoutSnapshot
  previous?: LoadoutSnapshot
}

export type LoadoutChange = {
  kind: 'category' | 'mcp' | 'skills' | 'file'
  name: string
  before: number
  after: number
  delta: number
}

export type LoadoutDiff = {
  since: string
  model?: { before: string; after: string }
  baseBefore: number
  baseAfter: number
  changes: LoadoutChange[]
}

/** Changes smaller than this are noise between two measurements. */
export const MIN_CHANGE_TOKENS = 50

const isConversation = (name: string) => /^messages$/i.test(name)

export function toSnapshot(loadout: Loadout, sessionId: string, at = new Date().toISOString()): LoadoutSnapshot {
  const items: Record<string, number> = {}
  for (const category of loadout.categories) {
    if (!isConversation(category.name)) items[`category:${category.name}`] = category.tokens
  }
  for (const server of loadout.mcpServers) items[`mcp:${server.server}`] = server.tokens
  for (const group of loadout.skillGroups) items[`skills:${group.source}`] = group.tokens
  for (const file of loadout.memoryFiles) items[`file:${file.path}`] = file.tokens
  return {
    shape: 'loadout-1',
    sessionId,
    at,
    model: loadout.model,
    baseTokens: loadout.categories.filter((category) => !isConversation(category.name)).reduce((total, category) => total + category.tokens, 0),
    items,
  }
}

function isSnapshot(value: unknown): value is LoadoutSnapshot {
  const snapshot = value as LoadoutSnapshot | undefined
  return snapshot?.shape === 'loadout-1' && typeof snapshot.sessionId === 'string' && typeof snapshot.items === 'object' && snapshot.items !== null
}

/**
 * Folds this session's snapshot into what the store holds for the project.
 * The baseline is the last snapshot of another session, so measuring twice,
 * or reloading the plugin, never compares a session with itself.
 */
export function rememberSnapshot(stored: unknown, snapshot: LoadoutSnapshot): { history: LoadoutHistory; baseline?: LoadoutSnapshot } {
  const history = stored as Partial<LoadoutHistory> | undefined
  const current = isSnapshot(history?.current) ? history.current : undefined
  const previous = isSnapshot(history?.previous) ? history.previous : undefined
  const baseline = current && current.sessionId !== snapshot.sessionId ? current : previous
  return { history: { current: snapshot, previous: baseline }, baseline }
}

export function diffLoadout(before: LoadoutSnapshot, after: LoadoutSnapshot): LoadoutDiff {
  const changes: LoadoutChange[] = []
  for (const id of new Set([...Object.keys(before.items), ...Object.keys(after.items)])) {
    const was = before.items[id] ?? 0
    const now = after.items[id] ?? 0
    if (Math.abs(now - was) < MIN_CHANGE_TOKENS) continue
    const split = id.indexOf(':')
    changes.push({ kind: id.slice(0, split) as LoadoutChange['kind'], name: id.slice(split + 1), before: was, after: now, delta: now - was })
  }
  changes.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
  return {
    since: before.at,
    model: before.model === after.model ? undefined : { before: before.model, after: after.model },
    baseBefore: before.baseTokens,
    baseAfter: after.baseTokens,
    changes,
  }
}

const CHANGE_LABEL: Record<LoadoutChange['kind'], string> = {
  category: 'Category',
  mcp: 'MCP server',
  skills: 'Skills from',
  file: 'File',
}

/** One line for a change: `MCP server linear: added, 3,000 tokens`. */
export function describeChange(change: LoadoutChange): string {
  const tokens = formatTokenCount
  const name = change.kind === 'file' ? shortPath(change.name) : change.name
  const what = change.before === 0
    ? `added, ${tokens(change.after)} tokens`
    : change.after === 0
      ? `removed, was ${tokens(change.before)} tokens`
      : `${change.delta > 0 ? '+' : '-'}${tokens(Math.abs(change.delta))} tokens (${tokens(change.before)} → ${tokens(change.after)})`
  return `${CHANGE_LABEL[change.kind]} ${name}: ${what}`
}

/** Markdown lines for the report's comparison section. */
export function formatDiff(diff: LoadoutDiff | undefined): string[] {
  if (!diff) return ['First measurement in this project: the next session will be compared with this one.']
  const tokens = formatTokenCount
  const delta = diff.baseAfter - diff.baseBefore
  const lines = [
    `Loaded before any message: ${tokens(diff.baseAfter)} tokens, ${delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : '-'}${tokens(Math.abs(delta))}`} since ${diff.since.slice(0, 16).replace('T', ' ')} UTC.`,
  ]
  if (diff.model) lines.push('', `Model changed: \`${diff.model.before}\` → \`${diff.model.after}\`.`)
  lines.push('', ...(diff.changes.length === 0
    ? ['No change of 50 tokens or more.']
    : diff.changes.slice(0, REPORT_ROWS).map((change) => `- ${describeChange(change)}`)))
  return lines
}
