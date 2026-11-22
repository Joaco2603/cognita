import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeSupplyChain, classifyCommand, formatSupplyChain, formatSupplyChainJson } from '../hooks/supply-chain.js'

const pin = (command, args) => classifyCommand(command, args).pin

test('npx without an exact version is unpinned', () => {
  assert.equal(pin('npx -y @modelcontextprotocol/server-github'), 'unpinned')
  assert.equal(pin('npx', ['-y', 'some-tool']), 'unpinned')
  assert.equal(pin('bunx some-tool'), 'unpinned')
  assert.equal(pin('pnpm dlx some-tool'), 'unpinned')
  assert.equal(pin('yarn dlx some-tool@^1.0.0'), 'unpinned')
})

test('@latest is unpinned even with a package spec', () => {
  assert.equal(pin('npx -y some-tool@latest'), 'unpinned')
  assert.equal(pin('npx', ['-y', '@scope/pkg@latest']), 'unpinned')
})

test('an exact version is pinned', () => {
  assert.equal(pin('npx -y some-tool@1.2.3'), 'pinned')
  assert.equal(pin('npx', ['-y', '@scope/pkg@2.0.1']), 'pinned')
})

test('uvx and pipx need an exact version', () => {
  assert.equal(pin('uvx mcp-server-fetch'), 'unpinned')
  assert.equal(pin('uvx mcp-server-fetch==1.2.3'), 'pinned')
  assert.equal(pin('uvx mcp-server-fetch@1.2.3'), 'pinned')
  assert.equal(pin('uvx', ['tool@latest']), 'unpinned')
  assert.equal(pin('pipx run black'), 'unpinned')
  assert.equal(pin('pipx run black==24.1.0'), 'pinned')
})

test('docker run needs a tag or digest, and not latest', () => {
  assert.equal(pin('docker run -i --rm mcp/github'), 'unpinned')
  assert.equal(pin('docker', ['run', '-i', '--rm', '-e', 'TOKEN', 'mcp/github:latest']), 'unpinned')
  assert.equal(pin('docker run --rm mcp/github@sha256:abc123'), 'pinned')
  assert.equal(pin('docker run --rm mcp/github:1.4.0'), 'pinned')
})

test('http(s) URLs are remote', () => {
  assert.equal(pin('https://example.com/mcp'), 'remote')
  assert.equal(pin('curl https://example.com/hook'), 'remote')
})

test('absolute paths and local scripts are local', () => {
  assert.equal(pin('/usr/local/bin/tool --flag'), 'local')
  assert.equal(pin('./scripts/check.sh'), 'local')
  assert.equal(pin('node', ['server.js']), 'local')
  assert.equal(pin('"$CLAUDE_PLUGIN_ROOT/hooks/run.sh"'), 'local')
})

test('a chained command takes its worst part', () => {
  assert.equal(pin('./check.sh && npx some-tool'), 'unpinned')
})

const settings = {
  user: {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'npx some-tool' }, { type: 'command', command: '/opt/safe.sh' }] }],
    },
    enabledPlugins: { 'tool@acme': true },
    extraKnownMarketplaces: { acme: { source: { source: 'github', repo: 'acme/plugins' } } },
  },
  project: {
    mcpServers: {
      gh: { command: 'npx', args: ['-y', 'server-github@1.0.0'] },
      remote: { type: 'http', url: 'https://mcp.example.com' },
      fetch: { command: 'uvx', args: ['mcp-server-fetch'] },
    },
  },
}

test('analyzeSupplyChain lists hooks and MCP servers with origin and counts unpinned commands', () => {
  const report = analyzeSupplyChain({ settings, toolServers: [], unreadable: [] })
  assert.equal(report.hooks.length, 2)
  assert.equal(report.hooks[0].event, 'PreToolUse')
  assert.equal(report.hooks[0].matcher, 'Bash')
  assert.equal(report.hooks[0].command, 'npx some-tool')
  assert.equal(report.hooks[0].source, 'user')
  assert.equal(report.hooks[0].pin, 'unpinned')
  assert.equal(report.mcpServers.length, 3)
  const gh = report.mcpServers.find((server) => server.name === 'gh')
  assert.equal(gh.transport, 'stdio')
  assert.equal(gh.origin, 'project settings')
  assert.equal(gh.pin, 'pinned')
  assert.equal(report.mcpServers.find((server) => server.name === 'remote').pin, 'remote')
  assert.equal(report.unpinned, 2)
  assert.deepEqual(report.plugins, [{ name: 'tool@acme', enabled: true, marketplace: 'acme', marketplaceSource: 'github acme/plugins' }])
})

test('summary line and JSON shape', () => {
  const report = analyzeSupplyChain({ settings, toolServers: ['github'], unreadable: ['plugin hooks'] })
  const text = formatSupplyChain(report)
  assert.match(text, /2 unpinned command\(s\) download code that can change without notice\./)
  assert.match(text, /tool@acme/)
  assert.match(text, /plugin hooks/)
  const json = JSON.parse(formatSupplyChainJson(report))
  assert.deepEqual(Object.keys(json).sort(), ['hooks', 'mcpServers', 'plugins', 'unpinned', 'unreadable'])
})

test('a settings object that is not an object never throws', () => {
  const report = analyzeSupplyChain({ settings: { user: 'oops', project: null }, toolServers: [], unreadable: [] })
  assert.equal(report.unpinned, 0)
  assert.match(formatSupplyChain(report), /No unpinned commands/)
})
