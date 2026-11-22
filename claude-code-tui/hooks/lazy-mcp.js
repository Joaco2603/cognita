/** Servers loaded in this many sessions here without a single call are worth holding. */
export const HOLD_AFTER_SESSIONS = 3;
const HOLD_MESSAGE = 'Held for this project by Cognita. Bring it back: /cognita connect <server>';
/** The tool-name spelling of an MCP server name: `plugin:a:b` becomes `plugin_a_b`. */
export function toolName(name) {
    return name.replaceAll(/[^A-Za-z0-9_-]/g, '_');
}
/** Comparison key: both spellings of one server, and any casing, land on the same key. */
export function serverKey(name) {
    return toolName(name).toLowerCase();
}
/** The first candidate whose key matches `input`; list display names first so they win ties. */
export function resolveServer(input, candidates) {
    const key = serverKey(input.trim());
    return candidates.find((candidate) => serverKey(candidate) === key);
}
/** The stored hold list: keys deduplicated; anything invalid reads as empty. */
export function readHeld(stored) {
    if (!Array.isArray(stored))
        return [];
    const keys = stored.filter((item) => typeof item === 'string' && item !== '').map(serverKey);
    return [...new Set(keys)];
}
function readUsage(stored) {
    const raw = stored;
    const servers = {};
    if (raw && typeof raw.servers === 'object' && raw.servers !== null) {
        for (const [name, entry] of Object.entries(raw.servers)) {
            if (entry && Number.isFinite(entry.loadedIn) && Number.isFinite(entry.usedIn)) {
                servers[name] = { loadedIn: entry.loadedIn, usedIn: entry.usedIn };
            }
        }
    }
    return { sessionId: typeof raw?.sessionId === 'string' ? raw.sessionId : '', servers };
}
/** Counts each measured server as loaded once per session; the same session again changes nothing. */
export function countLoaded(stored, sessionId, servers) {
    const usage = readUsage(stored);
    if (usage.sessionId === sessionId)
        return usage;
    const next = { sessionId, servers: { ...usage.servers } };
    for (const name of servers) {
        const entry = next.servers[name] ?? { loadedIn: 0, usedIn: 0 };
        next.servers[name] = { ...entry, loadedIn: entry.loadedIn + 1 };
    }
    return next;
}
export function countUsed(stored, server) {
    const usage = readUsage(stored);
    const entry = usage.servers[server] ?? { loadedIn: 0, usedIn: 0 };
    return { ...usage, servers: { ...usage.servers, [server]: { ...entry, usedIn: entry.usedIn + 1 } } };
}
/** Servers worth holding: loaded in enough sessions here and never called, not held already. */
export function suggestions(usage, held) {
    return Object.entries(usage?.servers ?? {})
        .filter(([name, entry]) => entry.loadedIn >= HOLD_AFTER_SESSIONS && entry.usedIn === 0 && !held.includes(serverKey(name)))
        .map(([server, entry]) => ({ server, sessions: entry.loadedIn }))
        .sort((left, right) => right.sessions - left.sessions);
}
const isOwnServer = (key) => /(^|_)cognita$/.test(key);
const code = (text) => '`' + text + '`';
/**
 * Per-session state of lazy MCP: which servers this project holds, which the
 * `mcp.connect` hook held back now, and which the user brought back.
 */
export function createLazyMcp() {
    const known = new Map();
    const heldNow = new Set();
    const connectedNow = new Set();
    const usedThisSession = new Set();
    let cwd = '';
    let startList;
    let writes = Promise.resolve();
    const folder = async (io) => {
        if (cwd)
            return cwd;
        try {
            return (await io.cwd()) || '';
        }
        catch {
            return '';
        }
    };
    const readList = async (io) => {
        const dir = await folder(io);
        return dir ? readHeld(await io.get(`held:${dir}`)) : [];
    };
    const readUsageOf = async (io) => {
        const dir = await folder(io);
        return dir ? readUsage(await io.get(`mcp-usage:${dir}`)) : undefined;
    };
    const nameOf = (key) => known.get(key) ?? key;
    const stateOf = (key) => connectedNow.has(key) ? 'connected this session' : heldNow.has(key) ? 'held now' : 'from next session';
    const pending = () => [...heldNow].filter((key) => !connectedNow.has(key));
    const knownNames = (servers) => {
        const byKey = new Map();
        for (const name of [...known.values(), ...servers.map((server) => server.server)]) {
            if (!byKey.has(serverKey(name)))
                byKey.set(serverKey(name), name);
        }
        return [...byKey.values()];
    };
    const resolve = (input, list, servers) => resolveServer(input, [...known.values(), ...list, ...servers.map((server) => server.server)]);
    const noMatch = (input, servers) => {
        const names = knownNames(servers);
        return `No MCP server matches ${code(input)}. Known: ${names.length ? names.join(', ') : 'none seen yet'}.`;
    };
    const connectKeys = async (io, keys, isReleased = false) => {
        const lines = [];
        for (const key of keys) {
            const name = nameOf(key);
            try {
                const result = await io.connect(name);
                if (result.isConnected) {
                    connectedNow.add(key);
                    lines.push(isReleased
                        ? `Connected ${code(name)} now; its tools arrive with the next request.`
                        : `Connected ${code(name)} for this session; its tools arrive with the next request. It stays held at the next start: ${code(`/cognita release ${name}`)} loads it every time.`);
                }
                else {
                    lines.push(`Could not connect ${code(name)}: ${result.message}`);
                }
            }
            catch (error) {
                lines.push(`Could not connect ${code(name)}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        return lines;
    };
    const listHeld = async (io) => {
        await writes;
        const list = await readList(io);
        const lines = list.length === 0
            ? ['Nothing held for this project.']
            : ['Held for this project:', '', ...list.map((key) => `- ${code(nameOf(key))}: ${stateOf(key)}`)];
        const hints = suggestions(await readUsageOf(io), list);
        if (hints.length > 0) {
            lines.push('', ...hints.map((hint) => `Suggested: ${code(nameOf(serverKey(hint.server)))} (loaded in ${hint.sessions} sessions here, never called)`));
        }
        return lines.join('\n');
    };
    return {
        setCwd(dir) {
            cwd = dir;
        },
        /** The `mcp.connect` hook: holds the engine's raise of a held server, passes everything else. */
        async onConnect(io, event, next) {
            try {
                if (typeof event.server === 'string') {
                    const key = serverKey(event.server);
                    known.set(key, event.server);
                    if (next?.origin?.plugin === 'engine' && !connectedNow.has(key)) {
                        startList ??= readList(io).then((list) => list.filter((item) => !isOwnServer(item))).catch(() => []);
                        if ((await startList).includes(key)) {
                            heldNow.add(key);
                            return { value: { isConnected: false, reason: 'disabled', message: HOLD_MESSAGE } };
                        }
                    }
                }
            }
            catch {
                // Fail open: a hook that breaks must let the server connect.
            }
            return next?.(event);
        },
        async hold(io, input, servers = []) {
            if (!input)
                return listHeld(io);
            const dir = await folder(io);
            if (!dir)
                return 'Could not tell which project this is, so nothing was held.';
            const list = await readList(io);
            const match = resolve(input, list, servers);
            if (!match)
                return noMatch(input, servers);
            const key = serverKey(match);
            const name = nameOf(key) === key ? match : nameOf(key);
            if (isOwnServer(key))
                return 'Cognita does not hold its own server.';
            if (list.includes(key))
                return `${code(name)} is already held for this project.`;
            await io.set(`held:${dir}`, [...list, key]);
            const tokens = servers.find((server) => serverKey(server.server) === key)?.tokens;
            const frees = tokens ? ` (frees ~${tokens.toLocaleString('en-US')} tokens at each start)` : '';
            return `Held ${code(name)} for this project: it stays off from the next session${frees}. Bring it back any time: ${code(`/cognita connect ${name}`)}.`;
        },
        async connect(io, input, servers = []) {
            if (!input) {
                const keys = pending();
                return keys.length === 0 ? 'No server is held in this session.' : (await connectKeys(io, keys)).join('\n');
            }
            const match = resolve(input, await readList(io), servers);
            if (!match)
                return noMatch(input, servers);
            return (await connectKeys(io, [serverKey(match)])).join('\n');
        },
        async release(io, input, servers = []) {
            if (!input)
                return `Say which server to release, or ${code('/cognita release all')}.`;
            const dir = await folder(io);
            const list = await readList(io);
            const keys = input.toLowerCase() === 'all'
                ? list
                : [resolve(input, list, servers)].filter((match) => Boolean(match)).map(serverKey).filter((key) => list.includes(key));
            if (keys.length === 0) {
                return input.toLowerCase() === 'all' ? 'Nothing held for this project.' : `${code(input)} is not held for this project.`;
            }
            await io.set(`held:${dir}`, list.filter((key) => !keys.includes(key)));
            const live = keys.filter((key) => heldNow.has(key) && !connectedNow.has(key));
            const extra = live.length > 0 ? await connectKeys(io, live, true) : [];
            return [`Released ${keys.map((key) => code(nameOf(key))).join(', ')}: ${keys.length === 1 ? 'it loads' : 'they load'} at every start again.`, ...extra].join('\n');
        },
        /** What the pane draws: held servers with their state, and how long idle servers have gone unused. */
        async view(io) {
            await writes;
            const held = (await readList(io)).map((key) => ({ name: nameOf(key), key, state: stateOf(key) }));
            const unusedSessions = {};
            for (const [server, entry] of Object.entries((await readUsageOf(io))?.servers ?? {})) {
                if (entry.usedIn === 0 && entry.loadedIn > 0)
                    unusedSessions[serverKey(server)] = entry.loadedIn;
            }
            return { held, unusedSessions };
        },
        /** Servers the hook held back that nobody connected yet, by display name. */
        pendingNames: () => pending().map(nameOf),
        /** Counts this session's measured servers as loaded, once per session. Best effort. */
        noteLoaded(io, sessionId, servers) {
            return (writes = writes.then(async () => {
                const dir = await folder(io);
                if (!dir)
                    return;
                const stored = await io.get(`mcp-usage:${dir}`);
                if (readUsage(stored).sessionId !== sessionId)
                    await io.set(`mcp-usage:${dir}`, countLoaded(stored, sessionId, servers));
            }).catch(() => undefined));
        },
        /** Counts the first call of each server per session. Fire and forget; never delays the call. */
        noteUsed(io, server) {
            if (usedThisSession.has(server))
                return;
            usedThisSession.add(server);
            writes = writes.then(async () => {
                const dir = await folder(io);
                if (!dir)
                    return;
                await io.set(`mcp-usage:${dir}`, countUsed(await io.get(`mcp-usage:${dir}`), server));
            }).catch(() => undefined);
        },
    };
}
