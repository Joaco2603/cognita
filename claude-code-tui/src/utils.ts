export type DashboardTab = 'overview' | 'context' | 'access' | 'agents'
export type AgentSubview = 'active' | 'inactive' | 'detail' | 'launch'
export type ContextSubview = 'overview' | 'memory' | 'mcp' | 'skills' | 'prompt'
export type AccessSubview = 'actions' | 'tools' | 'rules' | 'hooks'

export type Workspace = {
  name: string
  path: string
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

export function dirname(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'))
  if (index < 0) return trimmed
  if (index === 0) return trimmed.slice(0, 1)
  return trimmed.slice(0, index)
}

/** Joins with the separator the parent already uses, so Windows paths stay native. */
export function joinPath(parent: string, child: string): string {
  const separator = parent.includes('\\') && !parent.includes('/') ? '\\' : '/'
  return `${parent.replace(/[\\/]+$/, '')}${separator}${child}`
}

export function formatTokenCount(count: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(count))
}

/** Compact token figure for tight columns: 950, 12.4k, 1.2M. */
export function formatTokensShort(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 10_000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`
  return String(Math.round(count))
}

export function isActiveAgent(agent: AgentInfo): boolean {
  return agent.taskStatus === 'pending' || agent.taskStatus === 'running' || agent.taskStatus === 'paused'
}

export function slug(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '')
}
