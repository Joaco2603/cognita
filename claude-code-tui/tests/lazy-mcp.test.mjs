import assert from 'node:assert/strict'
import test from 'node:test'

import { HOLD_AFTER_SESSIONS, readHeld, resolveServer, serverKey, suggestions, toolName, countLoaded, countUsed } from '../hooks/features/lazy-mcp/lazy-mcp.js'

test('toolName maps /mcp names to the tool-name spelling and serverKey lowercases it', () => {
  assert.equal(toolName('plugin:cloudflare:cloudflare'), 'plugin_cloudflare_cloudflare')
  assert.equal(toolName('claude.ai Claude Docs'), 'claude_ai_Claude_Docs')
  assert.equal(serverKey('claude.ai Claude Docs'), 'claude_ai_claude_docs')
  assert.equal(serverKey('claude_ai_Claude_Docs'), serverKey('claude.ai Claude Docs'))
})

test('resolveServer matches by key and the first candidate (the display name) wins a tie', () => {
  const candidates = ['plugin:neon:neon', 'plugin_neon_neon', 'context7']
  assert.equal(resolveServer('PLUGIN_NEON_NEON', candidates), 'plugin:neon:neon')
  assert.equal(resolveServer('Context7', candidates), 'context7')
  assert.equal(resolveServer('nope', candidates), undefined)
})

test('readHeld keeps strings deduplicated by key and reads anything invalid as empty', () => {
  assert.deepEqual(readHeld(['a', 'A', 'b', 3, null]), ['a', 'b'])
  assert.deepEqual(readHeld('nope'), [])
  assert.deepEqual(readHeld(undefined), [])
})

test('usage counts a server as loaded once per session and as used at most once per call site', () => {
  const first = countLoaded(undefined, 's1', ['gh', 'db'])
  assert.deepEqual(first.servers, { gh: { loadedIn: 1, usedIn: 0 }, db: { loadedIn: 1, usedIn: 0 } })
  assert.deepEqual(countLoaded(first, 's1', ['gh', 'db']), first)
  const second = countLoaded(first, 's2', ['gh'])
  assert.equal(second.servers.gh.loadedIn, 2)
  assert.equal(second.servers.db.loadedIn, 1)
  assert.equal(countUsed(second, 'gh').servers.gh.usedIn, 1)
  assert.equal(countUsed(undefined, 'gh').servers.gh.usedIn, 1)
})

test('suggestions list servers loaded in enough sessions and never called, skipping held ones', () => {
  const usage = {
    sessionId: 's',
    servers: {
      db: { loadedIn: HOLD_AFTER_SESSIONS, usedIn: 0 },
      gh: { loadedIn: 9, usedIn: 2 },
      young: { loadedIn: HOLD_AFTER_SESSIONS - 1, usedIn: 0 },
      parked: { loadedIn: 7, usedIn: 0 },
    },
  }
  assert.deepEqual(suggestions(usage, ['parked']), [{ server: 'db', sessions: HOLD_AFTER_SESSIONS }])
})

import { createLazyMcp } from '../hooks/features/lazy-mcp/lazy-mcp.js'

/** A fake io with a store, a cwd and a recording `mcp.connect`. */
function fakeApi(stored = {}, answer = (server) => ({ isConnected: true, server })) {
  const store = new Map(Object.entries(stored))
  const connects = []
  const $ = {
    cwd: async () => '/proj',
    get: async (key) => store.get(key),
    set: async (key, value) => void store.set(key, value),
    connect: async (server) => (connects.push(server), answer(server)),
  }
  return { $, store, connects }
}
const engine = (result) => Object.assign(async () => result, { origin: { plugin: 'engine' } })
const fromPlugin = (result) => Object.assign(async () => result, { origin: { plugin: 'other' } })
const passed = { value: { isConnected: true, server: 'passed' } }

test('the hold hook refuses every engine raise of a held server and records the held key', async () => {
  const { $ } = fakeApi({ 'held:/proj': ['plugin_neon_neon'] })
  const lazy = createLazyMcp()
  for (let raise = 0; raise < 2; raise += 1) {
    const result = await lazy.onConnect($, { server: 'plugin:neon:neon' }, engine(passed))
    assert.equal(result.value.isConnected, false)
    assert.equal(result.value.reason, 'disabled')
    assert.match(result.value.message, /\/cognita connect/)
  }
  assert.deepEqual(lazy.pendingNames(), ['plugin:neon:neon'])
})

test('the hold hook passes other servers, other plugins and servers already connected', async () => {
  const { $ } = fakeApi({ 'held:/proj': ['context7'] })
  const lazy = createLazyMcp()
  assert.equal(await lazy.onConnect($, { server: 'github' }, engine(passed)), passed)
  assert.equal(await lazy.onConnect($, { server: 'context7' }, fromPlugin(passed)), passed)
  await lazy.onConnect($, { server: 'context7' }, engine(passed))
  assert.match(await lazy.connect($, 'context7'), /Connected `context7`/)
  assert.equal(await lazy.onConnect($, { server: 'context7' }, engine(passed)), passed)
})

test('the hold hook fails open when the store throws, and never holds the plugin own server', async () => {
  const broken = { cwd: async () => '/proj', get: async () => { throw new Error('boom') } }
  assert.equal(await createLazyMcp().onConnect(broken, { server: 'context7' }, engine(passed)), passed)
  const own = fakeApi({ 'held:/proj': ['plugin_cognita_cognita'] })
  assert.equal(await createLazyMcp().onConnect(own.$, { server: 'plugin:cognita:cognita' }, engine(passed)), passed)
  assert.match(await createLazyMcp().hold(own.$, 'cognita'), /No MCP server matches/)
})

test('connect with a name or with none brings back held servers and reports a refusal', async () => {
  const { $, connects } = fakeApi({ 'held:/proj': ['context7', 'vercel'] })
  const lazy = createLazyMcp()
  await lazy.onConnect($, { server: 'context7' }, engine(passed))
  await lazy.onConnect($, { server: 'vercel' }, engine(passed))
  assert.match(await lazy.connect($, ''), /Connected `context7`[^]*Connected `vercel`/)
  assert.deepEqual(connects, ['context7', 'vercel'])
  assert.equal(await lazy.connect($, ''), 'No server is held in this session.')
  assert.equal(lazy.pendingNames().length, 0)

  const refused = fakeApi({}, () => ({ isConnected: false, reason: 'auth', message: 'sign in first' }))
  const other = createLazyMcp()
  await other.onConnect(refused.$, { server: 'neon' }, engine(passed))
  assert.match(await other.connect(refused.$, 'neon'), /Could not connect `neon`: sign in first/)
})

test('release connects a server that was held back this session', async () => {
  const { $, connects, store } = fakeApi({ 'held:/proj': ['context7'] })
  const lazy = createLazyMcp()
  await lazy.onConnect($, { server: 'context7' }, engine(passed))
  const text = await lazy.release($, 'context7')
  assert.match(text, /Released `context7`/)
  assert.match(text, /Connected `context7`/)
  assert.doesNotMatch(text, /stays held/)
  assert.deepEqual(connects, ['context7'])
  assert.deepEqual(store.get('held:/proj'), [])
})

test('suggestions use the /mcp display name once the server has been seen', async () => {
  const usage = { sessionId: 's', servers: { claude_ai_Claude_Docs: { loadedIn: HOLD_AFTER_SESSIONS, usedIn: 0 } } }
  const { $ } = fakeApi({ 'mcp-usage:/proj': usage })
  const lazy = createLazyMcp()
  await lazy.onConnect($, { server: 'claude.ai Claude Docs' }, engine(passed))
  assert.match(await lazy.hold($, ''), /Suggested: `claude\.ai Claude Docs`/)
})

test('usage is keyed by the normalized server key, merging both spellings and old stored entries', () => {
  const loaded = countLoaded(undefined, 's1', ['plugin:neon:neon', 'claude.ai Claude Docs'])
  const used = countUsed(loaded, 'mcp_plugin_neon_neon'.replace('mcp_', ''))
  assert.deepEqual(used.servers, {
    plugin_neon_neon: { loadedIn: 1, usedIn: 1 },
    claude_ai_claude_docs: { loadedIn: 1, usedIn: 0 },
  })
  const old = { sessionId: 's0', servers: { 'plugin:neon:neon': { loadedIn: 2, usedIn: 0 }, plugin_neon_neon: { loadedIn: 1, usedIn: 4 } } }
  assert.deepEqual(countUsed(old, 'Plugin_Neon_Neon').servers, { plugin_neon_neon: { loadedIn: 3, usedIn: 5 } })
  assert.deepEqual(suggestions(countLoaded(old, 's9', ['plugin:neon:neon']), []), [])
})

test('two quick holds and a hold racing a release all stick', async () => {
  const servers = [{ server: 'a', tokens: 1 }, { server: 'b', tokens: 1 }, { server: 'c', tokens: 1 }]
  const { $, store } = fakeApi()
  const lazy = createLazyMcp()
  await Promise.all([lazy.hold($, 'a', servers), lazy.hold($, 'b', servers)])
  assert.deepEqual(store.get('held:/proj'), ['a', 'b'])
  await Promise.all([lazy.release($, 'a', servers), lazy.hold($, 'c', servers)])
  assert.deepEqual(store.get('held:/proj'), ['b', 'c'])
})

test('alternating sessions count each session once, and a session counts a server call once', async () => {
  const { $, store } = fakeApi()
  const a = createLazyMcp()
  const b = createLazyMcp()
  for (const [lazy, id] of [[a, 'A'], [b, 'B'], [a, 'A'], [b, 'B']]) await lazy.noteLoaded($, id, ['gh'])
  assert.equal(store.get('mcp-usage:/proj').servers.gh.loadedIn, 2)
  a.noteUsed($, 'gh')
  await a.noteLoaded($, 'A', ['gh'])
  const again = createLazyMcp()
  await again.noteLoaded($, 'A', ['gh'])
  again.noteUsed($, 'gh')
  await again.noteLoaded($, 'A', ['gh'])
  assert.equal(store.get('mcp-usage:/proj').servers.gh.usedIn, 1)
  const bounded = Array.from({ length: 80 }, (_, index) => `s${index}`)
  for (const id of bounded) await a.noteLoaded($, id, ['gh'])
  assert.ok(store.get('mcp-usage:/proj').recent.length <= 50)
})

test('usage stored in the old shape (one sessionId) still reads and dedupes that session', () => {
  const old = { sessionId: 'S', servers: { gh: { loadedIn: 2, usedIn: 0 } } }
  assert.equal(countLoaded(old, 'S', ['gh']).servers.gh.loadedIn, 2)
  assert.equal(countLoaded(old, 'T', ['gh']).servers.gh.loadedIn, 3)
})

test('a failed first read of the held list is not cached for the session', async () => {
  let failing = true
  const $ = { cwd: async () => '/proj', get: async () => { if (failing) throw new Error('boom'); return ['context7'] } }
  const lazy = createLazyMcp()
  assert.equal(await lazy.onConnect($, { server: 'context7' }, engine(passed)), passed)
  failing = false
  const held = await lazy.onConnect($, { server: 'context7' }, engine(passed))
  assert.equal(held.value.isConnected, false)
})
