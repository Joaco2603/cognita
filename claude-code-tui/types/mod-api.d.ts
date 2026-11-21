interface ModEvent {
  args?: string
  requestId?: string
  cwd?: string
}

interface UiComponents {
  Box: (props: Record<string, unknown>) => unknown
  Button: (props: Record<string, unknown>) => unknown
  Input: (props: Record<string, unknown>) => unknown
  Text: (props: Record<string, unknown>) => unknown
}

interface ModApi {
  agent: {
    list: () => Promise<AgentInfo[]>
    spawn: (input: {
      prompt: string
      description?: string
      cwd?: string
    }) => Promise<{ agentId?: string; model?: string; deny?: string }>
  }
  command: {
    register: (options: { name: string; description: string }) => Promise<void>
    run: (options: { command: string; args?: string }) => Promise<{ text?: string }>
  }
  ui: {
    open: (options: {
      id: string
      title: string
      focus?: true
      closeOnEscape?: true
    }) => Promise<{ isPlaced: boolean }>
    resolve: (event: ModEvent) => UiComponents
    invalidate: (event: 'ui.render') => void
    toast: (message: string) => Promise<void>
  }
  env: {
    get: (name: string) => Promise<string | undefined>
  }
  fs: {
    list: (path?: string) => Promise<Array<{
      name: string
      kind: 'file' | 'directory' | 'other'
      isLink: boolean
    }>>
  }
}

interface AgentInfo {
  id: string
  name?: string
  description: string
  type: string
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
  taskStatus: 'pending' | 'running' | 'completed' | 'failed' | 'killed' | 'paused'
  label: string
  cwd: string
  startTime: number
  tokenCount: number
  tokenSamples: number[]
  kind: 'local_agent' | 'in_process_teammate'
  hasRow: boolean
}

type ModHandler = (
  api: ModApi,
  event: ModEvent,
  next?: (event: ModEvent) => unknown,
) => unknown

interface ModOn {
  (event: 'session.start', handler: ModHandler): void
  (
    event: 'command.run',
    filter: { command: 'inspector' },
    handler: ModHandler,
  ): void
  (
    event: 'ui.render',
    filter: { component: 'Pane' },
    handler: ModHandler,
  ): void
}
