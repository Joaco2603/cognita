// Unit tests for the pure loadout analysis, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  emptyUsage,
  estimateTokens,
  findLevers,
  formatReport,
  mcpServerOf,
  measurePrompt,
  meter,
  pluginSections,
  recordSkillUse,
  recordToolCall,
  share,
  summarize,
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
