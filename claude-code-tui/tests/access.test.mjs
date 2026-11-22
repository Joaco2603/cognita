import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeAccess, countHooks, formatAccess, PROBES, readRuleSet, riskyAllowed } from '../hooks/access.js'

const probe = (key, verdict, extra = {}) => {
  const base = PROBES.find((item) => item.key === key)
  return { key, label: base.label, tool: base.tool, isRisky: base.isRisky, verdict, ...extra }
}

const input = {
  model: 'claude-opus-5-5',
  version: '2.1.330',
  tools: [
    { name: 'Bash', mcp: false },
    { name: 'Read', mcp: false },
    { name: 'mcp__github__create_issue', mcp: true },
    { name: 'mcp__github__list_prs', mcp: true },
    { name: 'mcp__claude_ai_Gmail__send', mcp: true },
  ],
  probes: [
    probe('shell', 'ask'),
    probe('push', 'allow', { rule: 'Bash(git push:*)' }),
    probe('env', 'deny', { rule: 'Read(./.env)' }),
    probe('web', 'missing'),
  ],
  settings: {
    user: {
      permissions: { allow: ['Bash(git push:*)'], defaultMode: 'acceptEdits' },
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'a' }, { type: 'command', command: 'b' }] }],
        Stop: [{ hooks: [{ type: 'command', command: 'c' }] }],
      },
      enabledPlugins: { 'a@m': true, 'b@m': false },
    },
    project: { permissions: { deny: ['Read(./.env)'] } },
    local: {},
  },
  commands: [
    { name: 'clear', source: 'builtin' },
    { name: 'compact', source: 'builtin' },
    { name: 'cognita', source: 'plugin', plugin: 'cognita' },
  ],
}

test('analyzeAccess groups MCP tools by server and keeps built-ins apart', () => {
  const report = analyzeAccess(input)
  assert.deepEqual(report.builtinTools, ['Bash', 'Read'])
  assert.deepEqual(report.mcpServers, [{ server: 'github', tools: 2 }, { server: 'claude_ai_Gmail', tools: 1 }])
  assert.equal(report.totalTools, 5)
})

test('analyzeAccess merges settings: rules by source, the last mode, hooks and plugins', () => {
  const report = analyzeAccess(input)
  assert.deepEqual(report.rules.map((rules) => rules.source), ['user', 'project'])
  assert.equal(report.defaultMode, 'acceptEdits')
  assert.equal(report.hookCount, 3)
  assert.deepEqual(report.hooks[0], { event: 'PreToolUse', count: 2, sources: ['user'] })
  assert.deepEqual(report.plugins.map((plugin) => [plugin.name, plugin.isEnabled]), [['a@m', true], ['b@m', false]])
  assert.deepEqual(report.commands[0], { source: 'builtin', count: 2, names: ['clear', 'compact'] })
  assert.equal(report.commands[1].source, 'plugin cognita')
})

test('flags name the risky actions that run without asking', () => {
  const report = analyzeAccess(input)
  assert.deepEqual(riskyAllowed(report).map((item) => item.key), ['push'])
  assert.match(report.flags[0], /1 risky action\(s\) run without asking: push to a git remote/)
  assert.match(report.flags[1], /3 hook command\(s\)/)
})

test('bypassPermissions is the first flag', () => {
  const report = analyzeAccess({ ...input, settings: { local: { permissions: { defaultMode: 'bypassPermissions' } } } })
  assert.equal(report.defaultMode, 'bypassPermissions')
  assert.match(report.flags[0], /bypassPermissions/)
})

test('an empty session reports nothing risky', () => {
  const report = analyzeAccess({ tools: [], probes: [], settings: {}, commands: [] })
  assert.equal(report.defaultMode, 'default')
  assert.deepEqual(report.flags, [])
  assert.match(formatAccess(report), /No risky action runs without asking\./)
})

test('readRuleSet and countHooks ignore malformed values', () => {
  assert.deepEqual(readRuleSet('user', { permissions: { allow: ['ok', 3], deny: 'nope' } }).allow, ['ok'])
  assert.deepEqual(readRuleSet('user', null).deny, [])
  assert.deepEqual(countHooks({ A: 'x', B: [{ hooks: [] }], C: [{}] }), { C: 1 })
})

test('formatAccess prints the tables a person reads', () => {
  const text = formatAccess(analyzeAccess(input))
  assert.match(text, /^## What this agent can do/)
  assert.match(text, /Model `claude-opus-5-5` · Claude Code 2\.1\.330 · permission mode `acceptEdits`/)
  assert.match(text, /\| ⚠ Push to a git remote \| Bash \| ● runs without asking \| rule `Bash\(git push:\*\)` \|/)
  assert.match(text, /\| Fetch web pages \| WebFetch \| · tool not available \|/)
  assert.match(text, /\| github \| 2 \|/)
  assert.match(text, /Denied: `Read\(\.\/\.env\)`/)
  assert.match(text, /\| PreToolUse \| 2 \| user \|/)
})

test('probe inputs point at the project and the home folder', () => {
  const paths = { cwd: 'C:\\repo', home: 'C:\\Users\\me' }
  assert.equal(PROBES.find((item) => item.key === 'env').input(paths).file_path, 'C:\\repo\\.env')
  assert.equal(PROBES.find((item) => item.key === 'ssh').input(paths).file_path, 'C:\\Users\\me\\.ssh\\id_rsa')
  assert.equal(PROBES.find((item) => item.key === 'outside').input({ cwd: '/r', home: '/home/me' }).file_path, '/home/me/.bashrc')
})

test('the 8 built-in samples are unchanged and no policy means no policy section', () => {
  assert.deepEqual(PROBES.map((item) => item.key), ['shell', 'edit', 'web', 'push', 'delete', 'env', 'ssh', 'outside'])
  const report = analyzeAccess(input)
  assert.deepEqual(report.policyViolations, [])
  assert.deepEqual(report.policyWarnings, [])
  assert.equal(report.flags.some((flag) => flag.startsWith('Policy')), false)
})

test('policy violations show up in the report, the flags and the Markdown', () => {
  const report = analyzeAccess({
    ...input,
    probes: [probe('env', 'allow')],
    policy: { require: { env: 'ask' }, actions: [] },
    policyWarnings: ['.cognita.json: bad'],
  })
  assert.deepEqual(report.policyViolations, ['Policy: Read .env secrets must ask; it runs without asking.'])
  assert.ok(report.flags.includes(report.policyViolations[0]))
  const text = formatAccess(report)
  assert.match(text, /Policy: Read \.env secrets must ask/)
  assert.match(text, /\.cognita\.json: bad/)
})

test('custom actions flow through as probes and are flagged when risky and allowed', () => {
  const custom = { key: 'tf', label: 'Terraform apply', tool: 'Bash', isRisky: true, verdict: 'allow' }
  const report = analyzeAccess({ ...input, probes: [...input.probes, custom] })
  assert.ok(riskyAllowed(report).some((item) => item.key === 'tf'))
})

test('MCP tools are probed per server: which run without asking', () => {
  const report = analyzeAccess({
    ...input,
    mcpProbes: [
      { name: 'mcp__github__create_issue', verdict: 'allow' },
      { name: 'mcp__github__list_prs', verdict: 'ask' },
      { name: 'mcp__claude_ai_Gmail__send', verdict: 'unknown' },
    ],
  })
  const github = report.mcpAccess.find((item) => item.server === 'github')
  assert.deepEqual(github.allowed, ['create_issue'])
  assert.equal(github.checked, 2)
  assert.equal(report.mcpAccess.find((item) => item.server === 'claude_ai_Gmail').unknown, 1)
  assert.ok(report.flags.some((flag) => flag.includes('github') && flag.includes('create_issue')))
  assert.match(formatAccess(report), /github.*create_issue/)
})

test('too-broad allow rules are flagged with their source', () => {
  const report = analyzeAccess({
    ...input,
    settings: {
      user: { permissions: { allow: ['Bash', 'Bash(*)', 'Bash(:*)', 'Bash(git push:*)', 'Write(**)', 'Edit(*)', 'Read(*)', 'mcp__github', 'mcp__slack__*', 'mcp__github__list_prs'] } },
      project: { permissions: { allow: ['Write'] } },
    },
  })
  const rules = report.broadRules.map((item) => `${item.source}:${item.rule}`)
  assert.deepEqual(rules, ['user:Bash', 'user:Bash(*)', 'user:Bash(:*)', 'user:Write(**)', 'user:Edit(*)', 'user:mcp__github', 'user:mcp__slack__*', 'project:Write'])
  assert.ok(report.flags.some((flag) => flag.includes('too broad')))
  assert.match(formatAccess(report), /Bash\(\*\)/)
})
