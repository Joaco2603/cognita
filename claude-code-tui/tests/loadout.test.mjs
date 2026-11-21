// Unit tests for the pure loadout analysis, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  baseTokensOf,
  describeChange,
  diffLoadout,
  emptyUsage,
  estimateTokens,
  findLevers,
  formatHistory,
  formatJson,
  formatReport,
  mcpServerOf,
  measurePrompt,
  parseTokens,
  meter,
  pluginSections,
  recordSkillUse,
  recordToolCall,
  rememberSnapshot,
  share,
  sinceBadge,
  sparkline,
  startupAlert,
  trendOf,
  summarize,
  toSnapshot,
} from '../hooks/loadout.js'
import { basename, dirname, joinPath } from '../hooks/utils.js'

const breakdown = {
  categories: [
    { name: 'System tools', tokens: 12000, color: '', isDeferred: false, kind: 'used' },
    { name: 'MCP tools', tokens: 6000, color: '', isDeferred: false, kind: 'used' },
    { name: 'MCP tools (deferred)', tokens: 1500, color: '', isDeferred: true, kind: 'deferred' },
    { name: 'Free space', tokens: 150000, color: '', isDeferred: false, kind: 'free' },
    { name: 'Autocompact buffer', tokens: 30000, color: '', isDeferred: false, kind: 'buffer' },
  ],
  totalTokens: 18000,
  maxTokens: 200000,
  rawMaxTokens: 200000,
  percentage: 9,
  model: 'claude-sonnet-5-5',
  memoryFiles: [
    { path: '/a/CLAUDE.md', type: 'Project', tokens: 10 },
    { path: '/b/CLAUDE.md', type: 'User', tokens: 90 },
  ],
  mcpTools: [
    { name: 'mcp__gh__a', serverName: 'gh', tokens: 4000, isLoaded: true },
    { name: 'mcp__gh__b', serverName: 'gh', tokens: 1500, isLoaded: false },
    { name: 'mcp__db__q', serverName: 'db', tokens: 2000, isLoaded: true },
  ],
  agents: [],
  skills: {
    totalSkills: 2,
    includedSkills: 2,
    tokens: 300,
    skillFrontmatter: [
      { name: 'release', source: 'plugin', pluginName: 'ops', tokens: 200 },
      { name: 'commit', source: 'userSettings', tokens: 100 },
    ],
  },
  isAutoCompactEnabled: true,
}

test('summarize groups MCP tools by server, counting only loaded tools as cost', () => {
  const usage = emptyUsage()
  recordToolCall(usage, 'mcp__gh__a')
  recordToolCall(usage, 'mcp__gh__a')
  const loadout = summarize(breakdown, usage)

  assert.deepEqual(loadout.mcpServers, [
    { server: 'gh', tokens: 4000, tools: 2, loadedTools: 1, calls: 2 },
    { server: 'db', tokens: 2000, tools: 1, loadedTools: 1, calls: 0 },
  ])
})

test('summarize separates free, buffer and deferred space from what is in the window', () => {
  const loadout = summarize(breakdown, emptyUsage())
  assert.equal(loadout.freeTokens, 150000)
  assert.equal(loadout.bufferTokens, 30000)
  assert.deepEqual(loadout.categories.map((category) => category.name), ['System tools', 'MCP tools'])
  assert.deepEqual(loadout.deferred, [{ name: 'MCP tools', tokens: 1500 }])
  assert.equal(loadout.deferredTokens, 1500)
})

test('a used category flagged isDeferred is treated as deferred', () => {
  const loadout = summarize({
    ...breakdown,
    categories: [{ name: 'System tools (deferred)', tokens: 900, color: '', isDeferred: true, kind: 'used' }],
  }, emptyUsage())
  assert.deepEqual(loadout.categories, [])
  assert.deepEqual(loadout.deferred, [{ name: 'System tools', tokens: 900 }])
})

test('skills are grouped by plugin or settings source', () => {
  const usage = emptyUsage()
  recordSkillUse(usage, 'commit')
  assert.deepEqual(summarize(breakdown, usage).skillGroups, [
    { source: 'plugin ops', skills: 1, tokens: 200, uses: 0 },
    { source: 'userSettings', skills: 1, tokens: 100, uses: 1 },
  ])
})

test('levers rank idle MCP servers, unused plugins and large instruction files', () => {
  const levers = findLevers(
    [{ server: 'db', tokens: 2000, tools: 1, loadedTools: 1, calls: 0 }, { server: 'gh', tokens: 9000, tools: 2, loadedTools: 2, calls: 3 }],
    [{ source: 'plugin ops', skills: 4, tokens: 800, uses: 0 }, { source: 'userSettings', skills: 9, tokens: 5000, uses: 0 }],
    [{ path: '/repo/CLAUDE.md', tokens: 3100 }, { path: '/repo/small.md', tokens: 40 }],
  )
  assert.deepEqual(levers.map((lever) => [lever.key, lever.tokens]), [
    ['file-/repo/CLAUDE.md', 3100],
    ['mcp-db', 2000],
    ['skills-plugin ops', 800],
  ])
  assert.equal(levers[2].text, "Disable plugin `ops` (4 skills, none used)")
})

test('the report caps long lists but keeps their totals', () => {
  const many = Array.from({ length: 20 }, (_, index) => ({ name: `s${index}`, source: 'userSettings', tokens: 10, }))
  const loadout = summarize({ ...breakdown, skills: { ...breakdown.skills, skillFrontmatter: many } }, emptyUsage())
  const report = formatReport(loadout, undefined, emptyUsage())
  assert.ok(report.includes("### Heaviest skills (top 15 of 20)"))
  assert.ok(report.includes("- …and 7 more (70 tokens)"))
  assert.ok(report.includes("Deferred, outside the window until loaded: MCP tools 1,500."))
})

test('summarize sorts instruction files by token cost', () => {
  const loadout = summarize(breakdown, emptyUsage())
  assert.deepEqual(loadout.memoryFiles.map((file) => file.path), ['/b/CLAUDE.md', '/a/CLAUDE.md'])
})

test('idle lists loaded items with no use, heaviest first', () => {
  const usage = emptyUsage()
  recordToolCall(usage, 'mcp__gh__a')
  recordSkillUse(usage, 'ops:release')
  const loadout = summarize(breakdown, usage)

  assert.deepEqual(loadout.idle, [
    { kind: 'mcp', name: 'db', tokens: 2000 },
    { kind: 'skill', name: 'commit', tokens: 100 },
  ])
  assert.equal(loadout.idleTokens, 2100)
})

test('a plugin skill counts uses under its bare or namespaced name', () => {
  const usage = emptyUsage()
  recordSkillUse(usage, 'release')
  recordSkillUse(usage, 'ops:release')
  const release = summarize(breakdown, usage).skills.find((skill) => skill.name === 'release')
  assert.equal(release.uses, 2)
})

test('summarize tolerates a breakdown with no skills section', () => {
  const loadout = summarize({ ...breakdown, skills: undefined }, emptyUsage())
  assert.deepEqual(loadout.skills, [])
})

test('mcpServerOf reads the server from an MCP tool id', () => {
  assert.equal(mcpServerOf('mcp__github__create_issue'), 'github')
  assert.equal(mcpServerOf('Bash'), undefined)
})

test('measurePrompt sizes sections and finds the ones plugins added', () => {
  const capture = measurePrompt(
    [
      { id: 'intro', text: 'x'.repeat(400), scope: 'shared' },
      { id: 'acme:policy', text: 'y'.repeat(40), scope: 'session' },
    ],
    [{ name: 'claudeMd', text: 'z'.repeat(80) }],
    [{ path: '/a/CLAUDE.md', kind: 'Project', content: 'hello' }],
  )
  assert.deepEqual(capture.sections[0], { id: 'intro', scope: 'shared', chars: 400 })
  assert.deepEqual(pluginSections(capture).map((section) => section.id), ['acme:policy'])
  assert.deepEqual(capture.instructionFiles, [{ path: '/a/CLAUDE.md', kind: 'Project', chars: 5 }])
  assert.equal(estimateTokens(400), 100)
})

test('meter and share handle edges', () => {
  assert.equal(meter(50, 10), '█████░░░░░')
  assert.equal(meter(250, 4), '████')
  assert.equal(meter(Number.NaN, 4), '░░░░')
  assert.equal(share(1, 1000), '<1%')
  assert.equal(share(0, 0), '0%')
})

test('formatReport renders markdown tables and the unused list', () => {
  const usage = emptyUsage()
  const report = formatReport(summarize(breakdown, usage), undefined, usage)
  assert.match(report, /^## Session loadout/)
  assert.match(report, /\| gh \| 1 \/ 2 \| 4,000 \| 0 \|/)
  assert.match(report, /MCP server `gh`: 4,000 tokens/)
  assert.match(report, /0 tool calls observed/)
})

test('path helpers handle POSIX and Windows paths', () => {
  assert.equal(basename('C:\\repos\\cognita'), 'cognita')
  assert.equal(basename('/home/user/project/'), 'project')
  assert.equal(dirname('C:\\repos\\cognita'), 'C:\\repos')
  assert.equal(dirname('/home/user/project'), '/home/user')
  assert.equal(joinPath('C:\\repos', 'cognita'), 'C:\\repos\\cognita')
  assert.equal(joinPath('/home/user/', 'programming'), '/home/user/programming')
})

test('a snapshot keeps what loads before any message, not the conversation', () => {
  const loadout = summarize({
    ...breakdown,
    categories: [...breakdown.categories, { name: 'Messages', tokens: 7000, color: '', isDeferred: false, kind: 'used' }],
  }, emptyUsage())
  const snapshot = toSnapshot(loadout, 's1', '2026-11-20T10:00:00.000Z')
  assert.equal(snapshot.baseTokens, 18000)
  assert.equal(snapshot.items['category:Messages'], undefined)
  assert.equal(snapshot.items['mcp:gh'], 4000)
  assert.equal(snapshot.items['skills:plugin ops'], 200)
  assert.equal(snapshot.items['file:/b/CLAUDE.md'], 90)
})

test('the baseline is the last snapshot of another session', () => {
  const loadout = summarize(breakdown, emptyUsage())
  const first = toSnapshot(loadout, 's1', '2026-11-20T10:00:00.000Z')
  assert.equal(rememberSnapshot(undefined, first).baseline, undefined)
  assert.equal(rememberSnapshot({ current: { shape: 'other' } }, first).baseline, undefined)

  const stored = rememberSnapshot(undefined, first).history
  const second = toSnapshot(loadout, 's2', '2026-11-21T10:00:00.000Z')
  const { history, baseline } = rememberSnapshot(stored, second)
  assert.equal(baseline.sessionId, 's1')

  // Measuring again in the same session keeps comparing with s1.
  const again = rememberSnapshot(history, { ...second, at: '2026-11-21T11:00:00.000Z' })
  assert.equal(again.baseline.sessionId, 's1')
  assert.equal(again.history.current.at, '2026-11-21T11:00:00.000Z')
})

test('diffLoadout lists added, removed and grown items, biggest first, ignoring noise', () => {
  const before = { shape: 'loadout-1', sessionId: 'a', at: '2026-11-20T10:00:00.000Z', model: 'm1', baseTokens: 10000,
    items: { 'mcp:gh': 4000, 'mcp:db': 2000, 'skills:userSettings': 500, 'file:/r/CLAUDE.md': 1000 } }
  const after = { shape: 'loadout-1', sessionId: 'b', at: '2026-11-21T10:00:00.000Z', model: 'm2', baseTokens: 13000,
    items: { 'mcp:gh': 4020, 'mcp:linear': 3000, 'skills:userSettings': 1400, 'file:/r/CLAUDE.md': 1000 } }
  const diff = diffLoadout(before, after)
  assert.deepEqual(diff.changes.map((change) => [change.kind, change.name, change.delta]), [
    ['mcp', 'linear', 3000],
    ['mcp', 'db', -2000],
    ['skills', 'userSettings', 900],
  ])
  assert.deepEqual(diff.model, { before: 'm1', after: 'm2' })
  assert.equal(describeChange(diff.changes[0]), 'MCP server linear: added, 3,000 tokens')
  assert.equal(describeChange(diff.changes[1]), 'MCP server db: removed, was 2,000 tokens')
  assert.equal(describeChange(diff.changes[2]), 'Skills from userSettings: +900 tokens (500 → 1,400)')

  const report = formatReport(summarize(breakdown, emptyUsage()), undefined, emptyUsage(), diff)
  assert.ok(report.includes('### Since last session'))
  assert.ok(report.includes('Loaded before any message: 13,000 tokens, +3,000 since 2026-11-20 10:00 UTC.'))
  assert.ok(!formatReport(summarize(breakdown, emptyUsage()), undefined, emptyUsage()).includes('Since last session'))
})

test('parseTokens reads plain, k and M amounts and rejects the rest', () => {
  assert.equal(parseTokens('30000'), 30000)
  assert.equal(parseTokens('30k'), 30000)
  assert.equal(parseTokens(' 1.5M '), 1500000)
  assert.equal(parseTokens('30,000'), 30000)
  assert.equal(parseTokens('0'), 0)
  assert.equal(parseTokens('lots'), undefined)
  assert.equal(parseTokens(undefined), undefined)
})

const grown = {
  since: '2026-11-20T10:00:00.000Z',
  baseBefore: 15000,
  baseAfter: 18000,
  changes: [
    { kind: 'mcp', name: 'db', before: 0, after: 2000, delta: 2000 },
    { kind: 'skills', name: 'userSettings', before: 100, after: 1100, delta: 1000 },
  ],
}

test('startupAlert warns on growth, names the cause, and prefers the budget', () => {
  const loadout = summarize(breakdown, emptyUsage())
  assert.equal(baseTokensOf(loadout), 18000)
  assert.equal(
    startupAlert(loadout, grown, { growth: 2000 }),
    'Context loadout grew +3.0k since last session, mostly MCP server db (new). Run /inspector report for details.',
  )
  assert.equal(startupAlert(loadout, grown, { growth: 5000 }), undefined)
  assert.equal(startupAlert(loadout, grown, { growth: 0 }), undefined)
  assert.equal(startupAlert(loadout, 'first', { growth: 2000 }), undefined)
  assert.ok(startupAlert(loadout, 'first', { growth: 2000, budget: 10000 }).startsWith('Context loadout 18k is over your 10k budget. '))
  assert.ok(startupAlert(loadout, grown, { growth: 2000, budget: 10000 }).includes('over your 10k budget (+3.0k since last session, mostly MCP server db (new))'))
  assert.equal(startupAlert(loadout, grown, { growth: 9000, budget: 20000 }), undefined)
})

test('sinceBadge is short and stays quiet for small or unknown changes', () => {
  assert.equal(sinceBadge(grown), '+3.0k vs last')
  assert.equal(sinceBadge({ ...grown, baseAfter: 15020 }), '')
  assert.equal(sinceBadge('first'), '')
  assert.equal(sinceBadge(undefined), '')
})

test('the JSON report carries the loadout, the budget and the comparison', () => {
  const data = JSON.parse(formatJson(summarize(breakdown, emptyUsage()), grown, { growth: 2000, budget: 10000 }))
  assert.equal(data.shape, 'inspector-report-1')
  assert.equal(data.baseTokens, 18000)
  assert.deepEqual(data.budget, { tokens: 10000, isOver: true })
  assert.equal(data.mcpServers[0].server, 'gh')
  assert.equal(data.sinceLastSession.changes[0].name, 'db')
  assert.equal(JSON.parse(formatJson(summarize(breakdown, emptyUsage()), 'first', { growth: 0 })).sinceLastSession.isFirst, true)
})

test('the report states the budget when one is set', () => {
  const loadout = summarize(breakdown, emptyUsage())
  assert.ok(formatReport(loadout, undefined, emptyUsage(), undefined, 10000).includes('**Over budget:** 18,000 tokens load before any message, 8,000 over the 10,000 budget.'))
  assert.ok(formatReport(loadout, undefined, emptyUsage(), undefined, 30000).includes('Within budget: 18,000 of 30,000 tokens'))
})

const snap = (sessionId, baseTokens, at = '2026-11-20T10:00:00.000Z') => ({
  shape: 'loadout-1', sessionId, at, model: 'claude-opus-5-5', baseTokens, items: {},
})

test('rememberSnapshot keeps one trend point per session, newest last, capped', () => {
  let stored
  for (let index = 0; index < 25; index++) stored = rememberSnapshot(stored, snap('s' + index, 1000 + index)).history
  stored = rememberSnapshot(stored, snap('s24', 9999)).history
  const trend = trendOf(stored)
  assert.equal(trend.length, 20)
  assert.equal(trend[0].sessionId, 's5')
  assert.equal(trend[19].sessionId, 's24')
  assert.equal(trend[19].baseTokens, 9999)
  assert.deepEqual(trendOf({ current: snap('old', 1) }), [])
  assert.deepEqual(trendOf('garbage'), [])
})

test('sparkline scales between the smallest and largest value', () => {
  assert.equal(sparkline([0, 7, 14]), '▁▅█')
  assert.equal(sparkline([5, 5]), '▄▄')
  assert.equal(sparkline([]), '')
})

test('formatHistory lists sessions newest first with the change and the budget', () => {
  const trend = [
    { sessionId: 'a', at: '2026-11-19T08:00:00.000Z', model: 'claude-opus-5-5', baseTokens: 20000 },
    { sessionId: 'b', at: '2026-11-20T08:00:00.000Z', model: 'claude-opus-5-5', baseTokens: 26000 },
    { sessionId: 'c', at: '2026-11-21T08:00:00.000Z', model: 'claude-opus-5-5', baseTokens: 24500 },
  ]
  const text = formatHistory(trend, 'c', 25000)
  assert.ok(text.includes('**Overall:** +4,500 tokens since 2026-11-19 08:00 UTC.'))
  assert.ok(text.includes('**Budget:** 1 of 3 sessions went over 25,000 tokens.'))
  const rows = text.split('\n').filter((line) => line.startsWith('| 2026'))
  assert.equal(rows[0], '| 2026-11-21 08:00 UTC (this session) | claude-opus-5-5 | 24,500 | -1,500 |')
  assert.equal(rows[2], '| 2026-11-19 08:00 UTC | claude-opus-5-5 | 20,000 |  |')
  assert.equal(formatHistory([]), 'No measurements saved for this project yet.')
})
