// Subset of the Claude Code mod API this plugin uses. The full contract ships
// with Claude Code (`claude-code` types); keep these shapes in step with it.

interface ModEvent {
  args?: string
  requestId?: string
  cwd?: string
  [field: string]: unknown
}

interface UiComponents {
  Box: (props: Record<string, unknown>) => unknown
  Button: (props: Record<string, unknown>) => unknown
  Input: (props: Record<string, unknown>) => unknown
  Text: (props: Record<string, unknown>) => unknown
}

/** One row of the context window breakdown, as /context groups it. */
interface ContextCategory {
  name: string
  tokens: number
  color: string
  isDeferred: boolean
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

interface ContextMemoryFile {
  path: string
  type: string
  tokens: number
}

interface ContextMcpTool {
  name: string
  serverName: string
  tokens: number
  isLoaded: boolean
}

interface ContextAgent {
  agentType: string
  source: string
  tokens: number
}

interface ContextSkill {
  name: string
  source: string
  pluginName?: string
  tokens: number
}

interface SessionContextBreakdown {
  categories: ContextCategory[]
  totalTokens: number
  maxTokens: number
  rawMaxTokens: number
  percentage: number
  model: string
  memoryFiles: ContextMemoryFile[]
  mcpTools: ContextMcpTool[]
  agents: ContextAgent[]
  slashCommands?: { totalCommands: number; includedCommands: number; tokens: number }
  skills?: { totalSkills: number; includedSkills: number; tokens: number; skillFrontmatter: ContextSkill[] }
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
}

interface SessionUsage {
  startedAt: number
  context: {
    tokens?: number
    window: number
    percent?: number
    breakdown?: SessionContextBreakdown
  }
  rateLimits: unknown[]
  cost?: { usd: number; hasUnknownPrice?: true }
}

interface PromptComposeSection {
  id: string
  text: string
  scope: 'shared' | 'session'
}

interface PromptContextBlock {
  name: string
  text: string
}

interface InstructionFile {
  path: string
  kind: string
  content: string
  parent?: string
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
    list: () => Promise<Array<{ name: string; description: string; source: string; plugin?: string }>>
  }
  tool: {
    list: () => Promise<Array<{ name: string; description: string; mcp: boolean }>>
    /** Asks the permission system what it would answer; runs nothing. */
    check: (input: { tool: string; input: unknown }) => Promise<{
      decision: 'allow' | 'ask' | 'deny'
      reason?: string
      rule?: string
    }>
  }
  settings: {
    read: (args?: { source?: 'user' | 'project' | 'local' | 'flag' | 'policy' }) => Promise<unknown>
  }
  session: {
    usage: (args?: { breakdown?: 'summary' | 'full'; columns?: number }) => Promise<SessionUsage>
    id: () => Promise<string>
    model: () => Promise<string>
    version: () => Promise<{ version: string; base?: string }>
    info: () => Promise<{ platform?: string; [field: string]: unknown }>
    /** The project folder the session started in. */
    cwd: () => Promise<string>
  }
  mcp: {
    /** Connects a server a hook held back; accepts the /mcp name or the tool-name spelling. */
    connect: (server: string) => Promise<
      { isConnected: true; server: string } | { isConnected: false; reason: string; message: string }
    >
  }
  /** Per-plugin JSON key-value store that outlives the session. */
  store: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    delete: (key: string) => Promise<void>
    keys: () => Promise<string[]>
  }
  ui: {
    open: (options: {
      id: string
      title: string
      focus?: true
      closeOnEscape?: true
      /** Width wanted while docked (capped at 45% of the terminal). */
      columns?: number
      /** Height wanted while inline above the prompt. */
      rows?: number
    }) => Promise<{ isPlaced: boolean }>
    resolve: (event: ModEvent) => UiComponents
    invalidate: (event: 'ui.render') => void
    toast: (message: string) => Promise<void>
    status: (text: string | undefined) => void
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

type ModNext = ((event: any) => any) & { origin?: { plugin: string } }

type ModHandler = (
  api: ModApi,
  event: ModEvent,
  next?: ModNext,
) => unknown

interface ModOn {
  (event: string, handler: ModHandler): unknown
  (event: string, filter: Record<string, unknown>, handler: ModHandler): unknown
}
