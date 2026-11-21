export type DashboardTab = 'dashboard' | 'agents'
export type AgentSubview = 'active' | 'inactive' | 'detail' | 'launch'

export type Workspace = {
  name: string
  path: string
}

export function basename(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function joinPath(parent: string, child: string): string {
  return `${parent.replace(/\/$/, '')}/${child}`
}

export function formatTokenCount(count: number): string {
  return new Intl.NumberFormat('en-US').format(count)
}

export function isActiveAgent(agent: AgentInfo): boolean {
  return agent.taskStatus === 'pending' || agent.taskStatus === 'running' || agent.taskStatus === 'paused'
}
