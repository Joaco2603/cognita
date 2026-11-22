// Pure analysis of what a Claude Code session's agent can reach and do:
// its tools, what the permission system answers for common risky actions,
// the permission rules by settings source, the hooks and plugins that run.
// No engine calls here, so it is unit-tested directly.

import { policyViolations as checkPolicy, type Policy } from './policy.js'
import { joinPath } from './utils.js'

export type Verdict = 'allow' | 'ask' | 'deny' | 'missing' | 'unknown'

/** One action we ask the permission system about, without running anything. */
export type Probe = {
  key: string
  label: string
  tool: string
  /** True when running it unattended deserves a flag. */
  isRisky: boolean
  input: (paths: { cwd: string; home: string }) => Record<string, unknown>
}

export type ProbeResult = {
  key: string
  label: string
  tool: string
  isRisky: boolean
  verdict: Verdict
  reason?: string
  rule?: string
}

export const PROBES: readonly Probe[] = [
  { key: 'shell', label: 'Run shell commands', tool: 'Bash', isRisky: false, input: () => ({ command: 'npm test' }) },
  { key: 'edit', label: 'Edit files in the project', tool: 'Edit', isRisky: false, input: ({ cwd }) => ({ file_path: joinPath(cwd, 'README.md'), old_string: 'a', new_string: 'b' }) },
  { key: 'web', label: 'Fetch web pages', tool: 'WebFetch', isRisky: false, input: () => ({ url: 'https://example.com', prompt: 'Summarize the page' }) },
  { key: 'push', label: 'Push to a git remote', tool: 'Bash', isRisky: true, input: () => ({ command: 'git push' }) },
  { key: 'delete', label: 'Delete files (rm -rf)', tool: 'Bash', isRisky: true, input: () => ({ command: 'rm -rf build' }) },
  { key: 'env', label: 'Read .env secrets', tool: 'Read', isRisky: true, input: ({ cwd }) => ({ file_path: joinPath(cwd, '.env') }) },
  { key: 'ssh', label: 'Read SSH keys', tool: 'Read', isRisky: true, input: ({ home }) => ({ file_path: joinPath(joinPath(home, '.ssh'), 'id_rsa') }) },
  { key: 'outside', label: 'Write outside the project', tool: 'Write', isRisky: true, input: ({ home }) => ({ file_path: joinPath(home, '.bashrc'), content: '' }) },
]

export const SETTINGS_SOURCES = ['user', 'project', 'local', 'flag', 'policy'] as const
export type SettingsSourceName = (typeof SETTINGS_SOURCES)[number]

const SOURCE_LABELS: Record<SettingsSourceName, string> = {
  user: 'user (~/.claude/settings.json)',
  project: 'project (.claude/settings.json)',
  local: 'local (.claude/settings.local.json)',
  flag: 'command line (--settings)',
  policy: 'managed policy',
}

export type RuleSet = {
  source: SettingsSourceName
  label: string
  allow: string[]
  ask: string[]
  deny: string[]
  defaultMode?: string
  additionalDirectories: string[]
}

export type HookGroup = { event: string; count: number; sources: SettingsSourceName[] }
export type PluginEntry = { name: string; isEnabled: boolean; source: SettingsSourceName }
export type CommandGroup = { source: string; count: number; names: string[] }
export type McpToolGroup = { server: string; tools: number }

/** What the permission system answered for each probed tool of one MCP server. */
export type McpServerAccess = {
  server: string
  checked: number
  /** Tool names (without the `mcp__server__` prefix) that run without asking. */
  allowed: string[]
  asked: number
  denied: number
  unknown: number
}

/** An allow rule that grants far more than one command or file. */
export type BroadRule = { rule: string; source: SettingsSourceName; label: string; why: string }

/** How many MCP tools are asked about; the rest are reported as not checked. */
export const MCP_PROBE_LIMIT = 300

export type AccessReport = {
  model: string
  version: string
  builtinTools: string[]
  mcpServers: McpToolGroup[]
  totalTools: number
  probes: ProbeResult[]
  rules: RuleSet[]
  defaultMode: string
  additionalDirectories: string[]
  hooks: HookGroup[]
  hookCount: number
  plugins: PluginEntry[]
  commands: CommandGroup[]
  commandCount: number
  mcpAccess: McpServerAccess[]
  /** MCP tools past `MCP_PROBE_LIMIT` that were not asked about. */
  mcpSkipped: number
  broadRules: BroadRule[]
  /** Sentences from `.cognita.json`; empty without a policy. */
  policyViolations: string[]
  policyWarnings: string[]
  /** Plain sentences, the most serious first. */
  flags: string[]
}

export type AccessInput = {
  model?: string
  version?: string
  tools: ReadonlyArray<{ name: string; mcp: boolean }>
  probes: ProbeResult[]
  settings: Partial<Record<SettingsSourceName, unknown>>
  commands: ReadonlyArray<{ name: string; source: string; plugin?: string }>
  /** One verdict per MCP tool that was probed with an empty input. */
  mcpProbes?: ReadonlyArray<{ name: string; verdict: Verdict }>
  /** MCP tools that were not probed because of the limit. */
  mcpSkipped?: number
  policy?: Pick<Policy, 'require'>
  policyWarnings?: string[]
}

const BROAD_BASH = /^Bash(\((\*|:\*)?\))?$/
const BROAD_FILE = /^(Write|Edit)(\((\*\*?)?\))?$/

/** Allow rules that cover every command, every file write or a whole MCP server. */
export function findBroadRules(rules: readonly RuleSet[]): BroadRule[] {
  const found: BroadRule[] = []
  for (const set of rules) {
    for (const raw of set.allow) {
      const rule = raw.trim()
      let why: string | undefined
      if (BROAD_BASH.test(rule)) why = 'allows any shell command'
      else if (BROAD_FILE.test(rule)) why = `allows ${rule.startsWith('Write') ? 'writing' : 'editing'} any file`
      else if (rule.startsWith('mcp__')) {
        const rest = rule.slice(5).replace(/__\*$/, '')
        if (rest && !rest.includes('__')) why = 'allows every tool of the MCP server'
      }
      if (why) found.push({ rule, source: set.source, label: set.label, why })
    }
  }
  return found
}

function groupMcpAccess(probes: NonNullable<AccessInput['mcpProbes']>): McpServerAccess[] {
  const groups = new Map<string, McpServerAccess>()
  for (const probe of probes) {
    const server = serverOf(probe.name) ?? 'mcp'
    const group = groups.get(server) ?? { server, checked: 0, allowed: [], asked: 0, denied: 0, unknown: 0 }
    if (probe.verdict === 'allow') { group.checked += 1; group.allowed.push(probe.name.slice(`mcp__${server}__`.length)) }
    else if (probe.verdict === 'ask') { group.checked += 1; group.asked += 1 }
    else if (probe.verdict === 'deny') { group.checked += 1; group.denied += 1 }
    else group.unknown += 1
    groups.set(server, group)
  }
  return [...groups.values()].sort((left, right) => right.allowed.length - left.allowed.length || left.server.localeCompare(right.server))
}

/** Splits `mcp__server__tool` into its server; undefined for a built-in. */
function serverOf(name: string): string | undefined {
  const match = /^mcp__(.+?)__/.exec(name)
  return match?.[1]
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** Counts the hook commands a settings `hooks` object declares, per event. */
export function countHooks(hooks: unknown): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const [event, matchers] of Object.entries(record(hooks))) {
    if (!Array.isArray(matchers)) continue
    let count = 0
    for (const matcher of matchers) {
      const inner = record(matcher).hooks
      count += Array.isArray(inner) ? inner.length : 1
    }
    if (count > 0) counts[event] = count
  }
  return counts
}

export function readRuleSet(source: SettingsSourceName, settings: unknown): RuleSet {
  const permissions = record(record(settings).permissions)
  const mode = permissions.defaultMode
  return {
    source,
    label: SOURCE_LABELS[source],
    allow: strings(permissions.allow),
    ask: strings(permissions.ask),
    deny: strings(permissions.deny),
    defaultMode: typeof mode === 'string' ? mode : undefined,
    additionalDirectories: strings(permissions.additionalDirectories),
  }
}

export function analyzeAccess(input: AccessInput): AccessReport {
  const builtinTools: string[] = []
  const servers = new Map<string, number>()
  for (const tool of input.tools) {
    const server = tool.mcp ? serverOf(tool.name) ?? 'mcp' : undefined
    if (server) servers.set(server, (servers.get(server) ?? 0) + 1)
    else builtinTools.push(tool.name)
  }
  const mcpServers = [...servers].map(([server, tools]) => ({ server, tools }))
    .sort((left, right) => right.tools - left.tools || left.server.localeCompare(right.server))

  const rules: RuleSet[] = []
  const hookMap = new Map<string, HookGroup>()
  const pluginMap = new Map<string, PluginEntry>()
  let defaultMode = 'default'
  const directories = new Set<string>()
  for (const source of SETTINGS_SOURCES) {
    if (!(source in input.settings)) continue
    const settings = input.settings[source]
    const ruleSet = readRuleSet(source, settings)
    if (ruleSet.allow.length + ruleSet.ask.length + ruleSet.deny.length > 0 || ruleSet.defaultMode || ruleSet.additionalDirectories.length > 0) {
      rules.push(ruleSet)
    }
    // Later sources take precedence, as the engine merges them.
    if (ruleSet.defaultMode) defaultMode = ruleSet.defaultMode
    for (const directory of ruleSet.additionalDirectories) directories.add(directory)
    for (const [event, count] of Object.entries(countHooks(record(settings).hooks))) {
      const group = hookMap.get(event) ?? { event, count: 0, sources: [] }
      group.count += count
      group.sources.push(source)
      hookMap.set(event, group)
    }
    for (const [name, isEnabled] of Object.entries(record(record(settings).enabledPlugins))) {
      if (typeof isEnabled === 'boolean') pluginMap.set(name, { name, isEnabled, source })
    }
  }
  const hooks = [...hookMap.values()].sort((left, right) => right.count - left.count || left.event.localeCompare(right.event))
  const plugins = [...pluginMap.values()].sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled) || left.name.localeCompare(right.name))

  const commandMap = new Map<string, CommandGroup>()
  for (const command of input.commands) {
    const source = command.source === 'plugin' && command.plugin ? `plugin ${command.plugin}` : command.source
    const group = commandMap.get(source) ?? { source, count: 0, names: [] }
    group.count += 1
    group.names.push(command.name)
    commandMap.set(source, group)
  }
  const commands = [...commandMap.values()].sort((left, right) => right.count - left.count || left.source.localeCompare(right.source))

  const mcpAccess = groupMcpAccess(input.mcpProbes ?? [])
  const mcpSkipped = Math.max(0, input.mcpSkipped ?? 0)
  const broadRules = findBroadRules(rules)
  const policyViolations = input.policy ? checkPolicy(input.policy, input.probes) : []
  const hookCount = hooks.reduce((total, group) => total + group.count, 0)
  return {
    model: input.model ?? 'unknown model',
    version: input.version ?? '',
    builtinTools: builtinTools.sort((left, right) => left.localeCompare(right)),
    mcpServers,
    totalTools: input.tools.length,
    probes: input.probes,
    rules,
    defaultMode,
    additionalDirectories: [...directories],
    hooks,
    hookCount,
    plugins,
    commands,
    commandCount: input.commands.length,
    mcpAccess,
    mcpSkipped,
    broadRules,
    policyViolations,
    policyWarnings: input.policyWarnings ?? [],
    flags: findFlags(input.probes, defaultMode, hookCount, policyViolations, mcpAccess, mcpSkipped, broadRules),
  }
}

function findFlags(
  probes: ProbeResult[],
  defaultMode: string,
  hookCount: number,
  violations: string[],
  mcpAccess: McpServerAccess[],
  mcpSkipped: number,
  broadRules: BroadRule[],
): string[] {
  const flags: string[] = [...violations]
  if (defaultMode === 'bypassPermissions') flags.push('Permission mode is bypassPermissions: every tool runs without asking.')
  const unattended = probes.filter((probe) => probe.isRisky && probe.verdict === 'allow')
  if (unattended.length > 0) {
    flags.push(`${unattended.length} risky action(s) run without asking: ${unattended.map((probe) => probe.label.toLowerCase()).join(', ')}.`)
  }
  // A check that failed says nothing, so it must never read as "all clear".
  const unchecked = probes.filter((probe) => probe.isRisky && probe.verdict === 'unknown')
  if (unchecked.length > 0) {
    flags.push(`${unchecked.length} risky action(s) could not be checked: ${unchecked.map((probe) => probe.label.toLowerCase()).join(', ')}.`)
  }
  const mcpUnchecked = mcpAccess.reduce((total, server) => total + server.unknown, 0)
  if (mcpUnchecked > 0) flags.push(`${mcpUnchecked} MCP tool(s) could not be checked.`)
  if (mcpSkipped > 0) flags.push(`${mcpSkipped} MCP tools not checked (limit ${MCP_PROBE_LIMIT}).`)
  for (const server of mcpAccess.filter((item) => item.allowed.length > 0)) {
    const names = server.allowed.slice(0, 5).join(', ')
    flags.push(`MCP server ${server.server}: ${server.allowed.length} of ${server.checked} tool(s) run without asking (${names}${server.allowed.length > 5 ? ', …' : ''}).`)
  }
  if (broadRules.length > 0) {
    flags.push(`${broadRules.length} allow rule(s) are too broad: ${broadRules.slice(0, 4).map((item) => `\`${item.rule}\` (${item.source})`).join(', ')}${broadRules.length > 4 ? ', …' : ''}.`)
  }
  if (hookCount > 0) flags.push(`${hookCount} hook command(s) from your settings run on your machine during the session.`)
  return flags
}

export function riskyAllowed(report: AccessReport): ProbeResult[] {
  return report.probes.filter((probe) => probe.isRisky && probe.verdict === 'allow')
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  allow: 'runs without asking',
  ask: 'asks you first',
  deny: 'blocked',
  missing: 'tool not available',
  unknown: 'could not check',
}

export const VERDICT_MARKS: Record<Verdict, string> = {
  allow: '●',
  ask: '◐',
  deny: '○',
  missing: '·',
  unknown: '?',
}

const ACCESS_ROWS = 15

export function table(headers: string[], rows: string[][]): string[] {
  const escape = (cell: string) => cell.replaceAll('|', '\\|')
  if (rows.length === 0) return ['_None._']
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ]
}

export function capped<T>(items: T[], limit = ACCESS_ROWS): { shown: T[]; rest: number } {
  return { shown: items.slice(0, limit), rest: Math.max(0, items.length - limit) }
}

/** The access report as Markdown, for `/cognita access`. */
export function formatAccess(report: AccessReport): string {
  const env = [`Model \`${report.model}\``, report.version ? `Claude Code ${report.version}` : '', `permission mode \`${report.defaultMode}\``]
    .filter(Boolean).join(' · ')
  const mcpTools = report.mcpServers.reduce((total, server) => total + server.tools, 0)
  const mcp = capped(report.mcpServers)
  const commands = capped(report.commands, 8)
  const lines: string[] = [
    '## What this agent can do',
    '',
    env,
    '',
    ...(report.flags.length === 0
      ? ['No risky action runs without asking.']
      : report.flags.map((flag) => `- **${flag}**`)),
    ...report.policyWarnings.map((warning) => `- _${warning}_`),
    '',
    '### Actions (asked of the permission system, nothing was run)',
    '',
    ...table(
      ['Action', 'Tool', 'Verdict', 'Why'],
      report.probes.map((probe) => [
        `${probe.isRisky ? '⚠ ' : ''}${probe.label}`,
        probe.tool,
        `${VERDICT_MARKS[probe.verdict]} ${VERDICT_LABELS[probe.verdict]}`,
        probe.rule ? `rule \`${probe.rule}\`` : probe.reason ?? '',
      ]),
    ),
    '',
    `### Tools · ${report.totalTools} (${report.builtinTools.length} built-in, ${mcpTools} from ${report.mcpServers.length} MCP server(s))`,
    '',
    report.builtinTools.length > 0 ? `Built-in: ${report.builtinTools.map((name) => `\`${name}\``).join(', ')}` : 'No built-in tools.',
    '',
    ...table(['MCP server', 'Tools'], mcp.shown.map((server) => [server.server, String(server.tools)])),
    ...(mcp.rest > 0 ? ['', `…and ${mcp.rest} more server(s).`] : []),
    ...(report.mcpAccess.length > 0
      ? [
          '',
          '#### MCP tools asked of the permission system (nothing was run)',
          '',
          ...table(
            ['MCP server', 'Run without asking', 'Ask', 'Blocked', 'Not checked'],
            capped(report.mcpAccess).shown.map((server) => [
              server.server,
              server.allowed.length === 0 ? '0' : `${server.allowed.length}: ${server.allowed.slice(0, 6).map((name) => `\`${name}\``).join(', ')}${server.allowed.length > 6 ? ', …' : ''}`,
              String(server.asked),
              String(server.denied),
              String(server.unknown),
            ]),
          ),
        ]
      : []),
    '',
    '### Permission rules by source',
    '',
    ...table(
      ['Source', 'Allow', 'Ask', 'Deny', 'Mode'],
      report.rules.map((rules) => [rules.label, String(rules.allow.length), String(rules.ask.length), String(rules.deny.length), rules.defaultMode ?? '']),
    ),
    ...ruleLines('Allowed without asking', report.rules.flatMap((rules) => rules.allow)),
    ...ruleLines('Always asks', report.rules.flatMap((rules) => rules.ask)),
    ...ruleLines('Denied', report.rules.flatMap((rules) => rules.deny)),
    ...(report.broadRules.length > 0
      ? ['', 'Too broad:', ...report.broadRules.map((item) => `- \`${item.rule}\` in ${item.label} ${item.why}`)]
      : []),
    ...(report.additionalDirectories.length > 0
      ? ['', `Extra directories it can reach: ${report.additionalDirectories.map((directory) => `\`${directory}\``).join(', ')}`]
      : []),
    '',
    `### Hooks · ${report.hookCount} command(s)`,
    '',
    ...table(['Event', 'Commands', 'Source'], report.hooks.map((group) => [group.event, String(group.count), group.sources.join(', ')])),
    '',
    `### Plugins · ${report.plugins.filter((plugin) => plugin.isEnabled).length} enabled`,
    '',
    ...table(['Plugin', 'State', 'Source'], capped(report.plugins).shown.map((plugin) => [plugin.name, plugin.isEnabled ? 'enabled' : 'disabled', plugin.source])),
    '',
    `### Slash commands · ${report.commandCount}`,
    '',
    ...table(['Source', 'Commands', 'Examples'], commands.shown.map((group) => [group.source, String(group.count), group.names.slice(0, 5).map((name) => `/${name}`).join(' ')])),
    ...(commands.rest > 0 ? ['', `…and ${commands.rest} more source(s).`] : []),
    '',
    '_Verdicts come from Claude Code\'s own permission check for a sample call; a rule for a narrower command can still differ._',
  ]
  return lines.join('\n')
}

function ruleLines(title: string, rules: string[]): string[] {
  if (rules.length === 0) return []
  const shown = capped(rules)
  return ['', `${title}: ${shown.shown.map((rule) => `\`${rule}\``).join(', ')}${shown.rest > 0 ? ` and ${shown.rest} more` : ''}`]
}

export function formatAccessJson(report: AccessReport): string {
  return JSON.stringify(report, null, 2)
}
