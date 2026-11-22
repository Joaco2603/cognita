import type { McpServerLoad } from './loadout.js'

/** Servers loaded in this many sessions here without a single call are worth holding. */
export const HOLD_AFTER_SESSIONS = 3

const HOLD_MESSAGE = 'Held for this project by Cognita. Bring it back: /cognita connect <server>'

export type HeldState = 'held now' | 'connected this session' | 'from next session'
export type HeldView = { name: string; key: string; state: HeldState }
/**
 * What lazy MCP needs from the mod API. Built in register.ts, where `$` is spelled
 * at each call site: the engine does not let a hooks module pass `$` around.
 */
export type LazyIo = {
  cwd: () => Promise<string>
  get: (key: string) => Promise<unknown>
  set: (key: string, value: unknown) => Promise<void>
  connect: (server: string) => Promise<{ isConnected: true; server: string } | { isConnected: false; reason: string; message: string }>
}
type ServerUsage = { loadedIn: number; usedIn: number; /** Sessions that already counted a call, newest last. */ usedBy?: string[] }
/** `recent` lists the sessions already counted as loaded (newest last); `sessionId` is the last of them, kept for old readers. */
export type McpUsage = { sessionId: string; recent?: string[]; servers: Record<string, ServerUsage> }

/** How many session ids the usage keeps to count each session once. */
export const RECENT_SESSIONS = 50
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item !== '') : [])
const newest = (list: readonly string[], id: string) => [...list.filter((item) => item !== id), id].slice(-RECENT_SESSIONS)

/** The tool-name spelling of an MCP server name: `plugin:a:b` becomes `plugin_a_b`. */
export function toolName(name: string): string {
  return name.replaceAll(/[^A-Za-z0-9_-]/g, '_')
}

/** Comparison key: both spellings of one server, and any casing, land on the same key. */
export function serverKey(name: string): string {
  return toolName(name).toLowerCase()
}

/** The first candidate whose key matches `input`; list display names first so they win ties. */
export function resolveServer(input: string, candidates: readonly string[]): string | undefined {
  const key = serverKey(input.trim())
  return candidates.find((candidate) => serverKey(candidate) === key)
}

/** The stored hold list: keys deduplicated; anything invalid reads as empty. */
export function readHeld(stored: unknown): string[] {
  if (!Array.isArray(stored)) return []
  const keys = stored.filter((item): item is string => typeof item === 'string' && item !== '').map(serverKey)
  return [...new Set(keys)]
}

function readUsage(stored: unknown): McpUsage {
  const raw = stored as Partial<McpUsage> | undefined
  const servers: McpUsage['servers'] = {}
  if (raw && typeof raw.servers === 'object' && raw.servers !== null) {
    for (const [name, entry] of Object.entries(raw.servers)) {
      if (entry && Number.isFinite(entry.loadedIn) && Number.isFinite(entry.usedIn)) {
        const key = serverKey(name)
        const seen = servers[key]
        const usedBy = [...new Set([...(seen?.usedBy ?? []), ...strings(entry.usedBy)])].slice(-RECENT_SESSIONS)
        servers[key] = {
          loadedIn: (seen?.loadedIn ?? 0) + entry.loadedIn,
          usedIn: (seen?.usedIn ?? 0) + entry.usedIn,
          ...(usedBy.length > 0 ? { usedBy } : {}),
        }
      }
    }
  }
  const sessionId = typeof raw?.sessionId === 'string' ? raw.sessionId : ''
  const recent = strings(raw?.recent)
  return { sessionId, recent: recent.length > 0 || !sessionId ? recent : [sessionId], servers }
}

/** Counts each measured server as loaded once per session; the same session again changes nothing. */
export function countLoaded(stored: unknown, sessionId: string, servers: readonly string[]): McpUsage {
  const usage = readUsage(stored)
  if (usage.recent?.includes(sessionId)) return usage
  const next: McpUsage = { sessionId, recent: newest(usage.recent ?? [], sessionId), servers: { ...usage.servers } }
  for (const name of new Set(servers.map(serverKey))) {
    const entry = next.servers[name] ?? { loadedIn: 0, usedIn: 0 }
    next.servers[name] = { ...entry, loadedIn: entry.loadedIn + 1 }
  }
  return next
}

/** Counts a call of `server`; with a session id, each session counts at most once per server. */
export function countUsed(stored: unknown, server: string, sessionId = ''): McpUsage {
  const usage = readUsage(stored)
  const key = serverKey(server)
  const entry = usage.servers[key] ?? { loadedIn: 0, usedIn: 0 }
  if (sessionId && entry.usedBy?.includes(sessionId)) return usage
  const usedBy = sessionId ? { usedBy: newest(entry.usedBy ?? [], sessionId) } : {}
  return { ...usage, servers: { ...usage.servers, [key]: { ...entry, ...usedBy, usedIn: entry.usedIn + 1 } } }
}

/** Servers worth holding: loaded in enough sessions here and never called, not held already. */
export function suggestions(usage: McpUsage | undefined, held: readonly string[]): Array<{ server: string; sessions: number }> {
  return Object.entries(usage?.servers ?? {})
    .filter(([name, entry]) => entry.loadedIn >= HOLD_AFTER_SESSIONS && entry.usedIn === 0 && !held.includes(serverKey(name)))
    .map(([server, entry]) => ({ server, sessions: entry.loadedIn }))
    .sort((left, right) => right.sessions - left.sessions)
}

const isOwnServer = (key: string) => /(^|_)cognita$/.test(key)
const code = (text: string) => '`' + text + '`'

/**
 * Per-session state of lazy MCP: which servers this project holds, which the
 * `mcp.connect` hook held back now, and which the user brought back.
 */
export function createLazyMcp() {
  const known = new Map<string, string>()
  const heldNow = new Set<string>()
  const connectedNow = new Set<string>()
  const usedThisSession = new Set<string>()
  let cwd = ''
  let sessionNow = ''
  let startList: Promise<string[]> | undefined
  let writes: Promise<unknown> = Promise.resolve()
  let listLock: Promise<unknown> = Promise.resolve()

  /** Runs `task` after every earlier hold/release finished, so read-modify-write of the held list never interleaves. */
  const exclusive = <T>(task: () => Promise<T>): Promise<T> => {
    const run = listLock.then(task, task)
    listLock = run.catch(() => undefined)
    return run
  }

  const folder = async (io: LazyIo): Promise<string> => {
    if (cwd) return cwd
    try {
      return (await io.cwd()) || ''
    } catch {
      return ''
    }
  }
  const readList = async (io: LazyIo): Promise<string[]> => {
    const dir = await folder(io)
    return dir ? readHeld(await io.get(`held:${dir}`)) : []
  }
  const readUsageOf = async (io: LazyIo): Promise<McpUsage | undefined> => {
    const dir = await folder(io)
    return dir ? readUsage(await io.get(`mcp-usage:${dir}`)) : undefined
  }
  const nameOf = (key: string) => known.get(key) ?? key
  const stateOf = (key: string): HeldState =>
    connectedNow.has(key) ? 'connected this session' : heldNow.has(key) ? 'held now' : 'from next session'
  const pending = () => [...heldNow].filter((key) => !connectedNow.has(key))

  const knownNames = (servers: readonly McpServerLoad[]) => {
    const byKey = new Map<string, string>()
    for (const name of [...known.values(), ...servers.map((server) => server.server)]) {
      if (!byKey.has(serverKey(name))) byKey.set(serverKey(name), name)
    }
    return [...byKey.values()]
  }
  const resolve = (input: string, list: readonly string[], servers: readonly McpServerLoad[]) =>
    resolveServer(input, [...known.values(), ...list, ...servers.map((server) => server.server)])
  const noMatch = (input: string, servers: readonly McpServerLoad[]) => {
    const names = knownNames(servers)
    return `No MCP server matches ${code(input)}. Known: ${names.length ? names.join(', ') : 'none seen yet'}.`
  }

  const connectKeys = async (io: LazyIo, keys: readonly string[], isReleased = false): Promise<string[]> => {
    const lines: string[] = []
    for (const key of keys) {
      const name = nameOf(key)
      try {
        const result = await io.connect(name)
        if (result.isConnected) {
          connectedNow.add(key)
          lines.push(isReleased
            ? `Connected ${code(name)} now; its tools arrive with the next request.`
            : `Connected ${code(name)} for this session; its tools arrive with the next request. It stays held at the next start: ${code(`/cognita release ${name}`)} loads it every time.`)
        } else {
          lines.push(`Could not connect ${code(name)}: ${result.message}`)
        }
      } catch (error) {
        lines.push(`Could not connect ${code(name)}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return lines
  }

  const listHeld = async (io: LazyIo): Promise<string> => {
    await writes
    const list = await readList(io)
    const lines = list.length === 0
      ? ['Nothing held for this project.']
      : ['Held for this project:', '', ...list.map((key) => `- ${code(nameOf(key))}: ${stateOf(key)}`)]
    const hints = suggestions(await readUsageOf(io), list)
    if (hints.length > 0) {
      lines.push('', ...hints.map((hint) => `Suggested: ${code(nameOf(serverKey(hint.server)))} (loaded in ${hint.sessions} sessions here, never called)`))
    }
    return lines.join('\n')
  }

  return {
    setCwd(dir: string) {
      cwd = dir
    },

    /** The `mcp.connect` hook: holds the engine's raise of a held server, passes everything else. */
    async onConnect(io: LazyIo, event: ModEvent, next?: ModNext) {
      try {
        if (typeof event.server === 'string') {
          const key = serverKey(event.server)
          known.set(key, event.server)
          if (next?.origin?.plugin === 'engine' && !connectedNow.has(key)) {
            startList ??= readList(io).then((list) => list.filter((item) => !isOwnServer(item))).catch(() => [])
            if ((await startList).includes(key)) {
              heldNow.add(key)
              return { value: { isConnected: false, reason: 'disabled', message: HOLD_MESSAGE } }
            }
          }
        }
      } catch {
        // Fail open: a hook that breaks must let the server connect.
      }
      return next?.(event)
    },

    async hold(io: LazyIo, input: string, servers: readonly McpServerLoad[] = []): Promise<string> {
      if (!input) return listHeld(io)
      return exclusive(async () => {
        const dir = await folder(io)
        if (!dir) return 'Could not tell which project this is, so nothing was held.'
        const list = await readList(io)
        const match = resolve(input, list, servers)
        if (!match) return noMatch(input, servers)
        const key = serverKey(match)
        const name = nameOf(key) === key ? match : nameOf(key)
        if (isOwnServer(key)) return 'Cognita does not hold its own server.'
        if (list.includes(key)) return `${code(name)} is already held for this project.`
        await io.set(`held:${dir}`, [...list, key])
        const tokens = servers.find((server) => serverKey(server.server) === key)?.tokens
        const frees = tokens ? ` (frees ~${tokens.toLocaleString('en-US')} tokens at each start)` : ''
        return `Held ${code(name)} for this project: it stays off from the next session${frees}. Bring it back any time: ${code(`/cognita connect ${name}`)}.`
      })
    },

    async connect(io: LazyIo, input: string, servers: readonly McpServerLoad[] = []): Promise<string> {
      if (!input) {
        const keys = pending()
        return keys.length === 0 ? 'No server is held in this session.' : (await connectKeys(io, keys)).join('\n')
      }
      const match = resolve(input, await readList(io), servers)
      if (!match) return noMatch(input, servers)
      return (await connectKeys(io, [serverKey(match)])).join('\n')
    },

    async release(io: LazyIo, input: string, servers: readonly McpServerLoad[] = []): Promise<string> {
      if (!input) return `Say which server to release, or ${code('/cognita release all')}.`
      const keys = await exclusive(async () => {
        const dir = await folder(io)
        const list = await readList(io)
        const found = input.toLowerCase() === 'all'
          ? list
          : [resolve(input, list, servers)].filter((match): match is string => Boolean(match)).map(serverKey).filter((key) => list.includes(key))
        if (found.length > 0) await io.set(`held:${dir}`, list.filter((key) => !found.includes(key)))
        return found
      })
      if (keys.length === 0) {
        return input.toLowerCase() === 'all' ? 'Nothing held for this project.' : `${code(input)} is not held for this project.`
      }
      const live = keys.filter((key) => heldNow.has(key) && !connectedNow.has(key))
      const extra = live.length > 0 ? await connectKeys(io, live, true) : []
      return [`Released ${keys.map((key) => code(nameOf(key))).join(', ')}: ${keys.length === 1 ? 'it loads' : 'they load'} at every start again.`, ...extra].join('\n')
    },

    /** What the pane draws: held servers with their state, and how long idle servers have gone unused. */
    async view(io: LazyIo): Promise<{ held: HeldView[]; unusedSessions: Record<string, number> }> {
      await writes
      const held = (await readList(io)).map((key) => ({ name: nameOf(key), key, state: stateOf(key) }))
      const unusedSessions: Record<string, number> = {}
      for (const [server, entry] of Object.entries((await readUsageOf(io))?.servers ?? {})) {
        if (entry.usedIn === 0 && entry.loadedIn > 0) unusedSessions[serverKey(server)] = entry.loadedIn
      }
      return { held, unusedSessions }
    },

    /** Servers the hook held back that nobody connected yet, by display name. */
    pendingNames: () => pending().map(nameOf),

    /** Counts this session's measured servers as loaded, once per session. Best effort. */
    noteLoaded(io: LazyIo, sessionId: string, servers: readonly string[]): Promise<unknown> {
      sessionNow = sessionId
      return (writes = writes.then(async () => {
        const dir = await folder(io)
        if (!dir) return
        const stored = await io.get(`mcp-usage:${dir}`)
        if (!readUsage(stored).recent?.includes(sessionId)) await io.set(`mcp-usage:${dir}`, countLoaded(stored, sessionId, servers))
      }).catch(() => undefined))
    },

    /** Counts the first call of each server per session. Fire and forget; never delays the call. */
    noteUsed(io: LazyIo, server: string): void {
      if (usedThisSession.has(server)) return
      usedThisSession.add(server)
      writes = writes.then(async () => {
        const dir = await folder(io)
        if (!dir) return
        await io.set(`mcp-usage:${dir}`, countUsed(await io.get(`mcp-usage:${dir}`), server, sessionNow))
      }).catch(() => undefined)
    },
  }
}

export type LazyMcp = ReturnType<typeof createLazyMcp>
