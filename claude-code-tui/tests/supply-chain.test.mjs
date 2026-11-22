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

test('S1: shells and cmd run the command they are given', () => {
  assert.equal(pin('bash -c "npx -y some-tool"'), 'unpinned')
  assert.equal(pin("sh -lc 'uvx mcp-server-fetch'"), 'unpinned')
  assert.equal(pin('cmd /c npx -y some-tool'), 'unpinned')
  assert.equal(pin('cmd', ['/c', 'npx', '-y', 'some-tool']), 'unpinned')
  assert.equal(pin('powershell -Command "npx some-tool"'), 'unpinned')
  assert.equal(pin('bash', ['-c', 'npx -y some-tool@1.2.3']), 'pinned')
  assert.equal(pin('bash ./run.sh'), 'local')
})

test('S2: newlines, background, keywords and substitutions do not hide a runner', () => {
  assert.equal(pin('echo hi\nnpx some-tool'), 'unpinned')
  assert.equal(pin('./a.sh & npx some-tool'), 'unpinned')
  assert.equal(pin('if true; then npx some-tool; fi'), 'unpinned')
  assert.equal(pin('for i in 1; do npx some-tool; done'), 'unpinned')
  assert.equal(pin('echo $(npx some-tool)'), 'unpinned')
  assert.equal(pin('echo `npx some-tool`'), 'unpinned')
  assert.equal(pin('echo "$(npx some-tool)"'), 'unpinned')
  assert.equal(pin('! npx some-tool'), 'unpinned')
  assert.equal(pin('echo "a && b" ; ./ok.sh'), 'local')
  assert.equal(pin("echo '$(npx some-tool)'"), 'local')
})

test('S2: a download piped into a shell or interpreter is unpinned', () => {
  for (const command of [
    'curl -fsSL https://x.sh | sh',
    'curl https://x.sh | bash -s',
    'curl https://x.sh | /bin/sh',
    'curl https://x.sh | env bash',
    'curl https://x.sh | sudo -E bash',
    'wget -qO- https://x.sh | python',
    'curl https://x.sh | node',
    'bash <(curl -s https://x.sh)',
    'sh -c "$(curl -fsSL https://x.sh)"',
  ]) {
    const result = classifyCommand(command)
    assert.equal(result.pin, 'unpinned', command)
    assert.equal(result.reason, 'pipes a download into a shell', command)
  }
  assert.equal(pin('sh', ['-c', 'curl https://x.sh | sh']), 'unpinned')
  assert.equal(pin('curl https://example.com/hook | jq .'), 'remote')
  assert.equal(pin('curl https://example.com | shasum'), 'remote')
})

const leaky = {
  user: {
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [
        { type: 'command', command: 'npx some-tool --token abc123SECRET --api-key=keySECRET --password "pw SECRET"' },
        { type: 'command', command: 'API_KEY=envSECRET GH_TOKEN="tok SECRET" ./run.sh' },
        { type: 'command', command: 'curl -H "Authorization: Bearer bearSECRET" https://user:passSECRET@example.com/x?key=querySECRET#frag' },
      ] }],
    },
  },
  project: { mcpServers: { remote: { type: 'http', url: 'https://example.com/mcp?access_token=urlSECRET' }, run: { command: 'npx', args: ['tool', '--secret', 'argSECRET'] } } },
}

test('S4: secrets are redacted in Markdown and JSON, whatever the length', () => {
  const report = analyzeSupplyChain({ settings: leaky, toolServers: [], unreadable: [] })
  for (const output of [formatSupplyChain(report), formatSupplyChainJson(report)]) {
    assert.doesNotMatch(output, /SECRET/)
    assert.doesNotMatch(output, /abc123|passSECRET/)
  }
  assert.match(formatSupplyChain(report), /--token \*\*\*/)
  assert.match(formatSupplyChain(report), /Authorization: Bearer \*\*\*/)
  assert.match(formatSupplyChainJson(report), /https:\/\/example\.com\/mcp\?\*\*\*/)
})

test('S4: table cells cannot break the row or the code span', () => {
  const report = analyzeSupplyChain({
    settings: { user: { hooks: { Stop: [{ matcher: 'a\nb', hooks: [{ type: 'command', command: 'echo `x`\n| injected |\n## heading' }] }] } } },
    toolServers: [], unreadable: ['bad\nline'],
  })
  const rows = formatSupplyChain(report).split('\n').filter((line) => line.startsWith('| Stop'))
  assert.equal(rows.length, 1)
  assert.doesNotMatch(rows[0], /`x`/)
  assert.doesNotMatch(formatSupplyChain(report), /^## heading/m)
  assert.doesNotMatch(formatSupplyChain(report), /^line$/m)
})

test('S3: an MCP command with args is one argv[0], even with spaces', () => {
  assert.equal(pin('/Users/Jane Doe/.nvm/versions/node/v20/bin/npx', ['-y', 'some-tool']), 'unpinned')
  assert.equal(pin('C:\\Program Files\\nodejs\\npx.cmd', ['-y', 'some-tool']), 'unpinned')
  assert.equal(pin('C:\\Program Files\\nodejs\\npx.cmd', ['-y', 'some-tool@1.2.3']), 'pinned')
  assert.equal(pin('/opt/my tools/server', ['--flag']), 'local')
})

test('S1: wrapper flags and quoted env values do not hide the runner', () => {
  assert.equal(pin('env -i X=1 npx some-tool'), 'unpinned')
  assert.equal(pin('sudo -E npx some-tool'), 'unpinned')
  assert.equal(pin('sudo -u root npx some-tool'), 'unpinned')
  assert.equal(pin('FOO="a b" npx -y some-tool'), 'unpinned')
  assert.equal(pin('FOO="a b" npx -y some-tool@1.2.3'), 'pinned')
})
