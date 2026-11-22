// Pure check of the Claude Code engine APIs Cognita needs.

export type Requirement = {
  /** The API path, as written in plugin code. */
  api: string
  /** The Cognita feature that stops working without it. */
  feature: string
  /** False when calling it has side effects or a cost (usage is measured by the startup check), so it is assumed present. */
  probed: boolean
}

/** Every engine API Cognita calls, with the feature each one powers. */
export const REQUIREMENTS: readonly Requirement[] = [
  { api: '$.tool.list', feature: 'Access', probed: true },
  { api: '$.tool.check', feature: 'Access', probed: true },
  { api: '$.settings.read', feature: 'Access rules and hooks', probed: true },
  { api: '$.session.usage', feature: 'Context', probed: false },
  { api: '$.session.id', feature: 'History', probed: true },
  { api: '$.store.get', feature: 'History', probed: true },
  { api: '$.store.set', feature: 'History', probed: false },
  { api: '$.session.model', feature: 'Model name', probed: true },
  { api: '$.session.version', feature: 'Version in reports', probed: true },
  { api: '$.agent.list', feature: 'Agents', probed: true },
  { api: '$.agent.spawn', feature: 'Agents (new agent)', probed: false },
  { api: '$.command.register', feature: '/cognita command', probed: false },
  { api: '$.command.list', feature: 'Access (commands)', probed: true },
  { api: '$.ui.open', feature: 'Pane', probed: false },
  { api: '$.ui.resolve', feature: 'Pane', probed: false },
  { api: '$.ui.invalidate', feature: 'Pane', probed: true },
  { api: '$.ui.toast', feature: 'Startup alerts', probed: false },
  { api: '$.ui.status', feature: 'Status line', probed: false },
  { api: '$.env.get', feature: 'Settings from environment', probed: true },
  { api: '$.mcp.connect', feature: 'Lazy MCP (hold and connect)', probed: false },
]

export type CompatReport = {
  ok: boolean
  missing: Requirement[]
  present: string[]
}

/** A missing API surfaces as a TypeError when called; any other failure means it exists. */
function isMissingApi(error: unknown): boolean {
  return error instanceof TypeError
}

async function attempt(probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe()
    return true
  } catch (error) {
    return !isMissingApi(error)
  }
}

/**
 * Calls the read-only engine APIs once and records which exist. Each call is
 * spelled out so `$` only appears as `$.noun.event(...)`. APIs with side
 * effects (spawn, toast, store.set, ui.open, mcp.connect) are never called.
 */
export async function probeEngine($: any): Promise<Record<string, boolean>> {
  const found: Record<string, boolean> = {}
  found['$.tool.list'] = await attempt(() => $.tool.list())
  found['$.tool.check'] = await attempt(() => $.tool.check({ tool: 'Read', input: { file_path: '.' } }))
  found['$.settings.read'] = await attempt(() => $.settings.read({ source: 'user' }))
  found['$.session.id'] = await attempt(() => $.session.id())
  found['$.session.model'] = await attempt(() => $.session.model())
  found['$.session.version'] = await attempt(() => $.session.version())
  found['$.store.get'] = await attempt(() => $.store.get('cognita:probe'))
  found['$.agent.list'] = await attempt(() => $.agent.list())
  found['$.command.list'] = await attempt(() => $.command.list())
  found['$.env.get'] = await attempt(() => $.env.get('HOME'))
  found['$.ui.invalidate'] = await attempt(async () => $.ui.invalidate('ui.render'))
  return found
}

/**
 * Which required APIs the probe result lacks. Pure: takes what probeEngine
 * returned. Anything that is not a probe record counts as everything missing.
 * Never throws.
 */
export function checkCompatibility(probes: unknown): CompatReport {
  const isRecord = typeof probes === 'object' && probes !== null
  const found = (isRecord ? probes : {}) as Record<string, unknown>
  const missing: Requirement[] = []
  const present: string[] = []
  for (const requirement of REQUIREMENTS) {
    if (isRecord && (!requirement.probed || found[requirement.api] === true)) present.push(requirement.api)
    else missing.push(requirement)
  }
  return { ok: missing.length === 0, missing, present }
}

function featuresOf(report: CompatReport): string[] {
  return [...new Set(report.missing.map((entry) => entry.feature))]
}

/** One notice for the user, or undefined when everything is there. */
export function compatToast(report: CompatReport): string | undefined {
  if (report.ok) return undefined
  const features = featuresOf(report)
  const apis = report.missing.map((entry) => entry.api).join(', ')
  const verb = features.length === 1 ? 'is' : 'are'
  return `Cognita: ${features.join(', ')} ${verb} off — this Claude Code has no ${apis}. Update Claude Code.`
}

/** The one-line summary for `/cognita report`. */
export function compatLine(report: CompatReport): string {
  if (report.ok) return `Compatibility: OK (${report.present.length} engine APIs found)`
  return `Compatibility: ${report.missing.length} engine API(s) missing; off: ${featuresOf(report).join(', ')}. Run /cognita doctor.`
}

/** The full table for `/cognita doctor`. */
export function formatDoctor(report: CompatReport, version: string | undefined): string {
  const missing = new Set(report.missing.map((entry) => entry.api))
  const rows = REQUIREMENTS.map((entry) =>
    `| \`${entry.api}\` | ${entry.feature} | ${missing.has(entry.api) ? 'missing' : entry.probed ? 'ok' : 'assumed (has side effects, not probed)'} |`)
  return [
    '**Cognita doctor**',
    '',
    `Claude Code version: ${version ?? 'unknown (the engine does not expose it)'}`,
    '',
    '| Engine API | Powers | Status |',
    '| --- | --- | --- |',
    ...rows,
    '',
    compatLine(report),
  ].join('\n')
}
