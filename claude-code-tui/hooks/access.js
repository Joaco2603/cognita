// Pure analysis of what a Claude Code session's agent can reach and do:
// its tools, what the permission system answers for common risky actions,
// the permission rules by settings source, the hooks and plugins that run.
// No engine calls here, so it is unit-tested directly.
import { joinPath } from './utils.js';
export const PROBES = [
    { key: 'shell', label: 'Run shell commands', tool: 'Bash', isRisky: false, input: () => ({ command: 'npm test' }) },
    { key: 'edit', label: 'Edit files in the project', tool: 'Edit', isRisky: false, input: ({ cwd }) => ({ file_path: joinPath(cwd, 'README.md'), old_string: 'a', new_string: 'b' }) },
    { key: 'web', label: 'Fetch web pages', tool: 'WebFetch', isRisky: false, input: () => ({ url: 'https://example.com', prompt: 'Summarize the page' }) },
    { key: 'push', label: 'Push to a git remote', tool: 'Bash', isRisky: true, input: () => ({ command: 'git push' }) },
    { key: 'delete', label: 'Delete files (rm -rf)', tool: 'Bash', isRisky: true, input: () => ({ command: 'rm -rf build' }) },
    { key: 'env', label: 'Read .env secrets', tool: 'Read', isRisky: true, input: ({ cwd }) => ({ file_path: joinPath(cwd, '.env') }) },
    { key: 'ssh', label: 'Read SSH keys', tool: 'Read', isRisky: true, input: ({ home }) => ({ file_path: joinPath(joinPath(home, '.ssh'), 'id_rsa') }) },
    { key: 'outside', label: 'Write outside the project', tool: 'Write', isRisky: true, input: ({ home }) => ({ file_path: joinPath(home, '.bashrc'), content: '' }) },
];
export const SETTINGS_SOURCES = ['user', 'project', 'local', 'flag', 'policy'];
const SOURCE_LABELS = {
    user: 'user (~/.claude/settings.json)',
    project: 'project (.claude/settings.json)',
    local: 'local (.claude/settings.local.json)',
    flag: 'command line (--settings)',
    policy: 'managed policy',
};
/** Splits `mcp__server__tool` into its server; undefined for a built-in. */
function serverOf(name) {
    const match = /^mcp__(.+?)__/.exec(name);
    return match?.[1];
}
const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
/** Counts the hook commands a settings `hooks` object declares, per event. */
export function countHooks(hooks) {
    const counts = {};
    for (const [event, matchers] of Object.entries(record(hooks))) {
        if (!Array.isArray(matchers))
            continue;
        let count = 0;
        for (const matcher of matchers) {
            const inner = record(matcher).hooks;
            count += Array.isArray(inner) ? inner.length : 1;
        }
        if (count > 0)
            counts[event] = count;
    }
    return counts;
}
export function readRuleSet(source, settings) {
    const permissions = record(record(settings).permissions);
    const mode = permissions.defaultMode;
    return {
        source,
        label: SOURCE_LABELS[source],
        allow: strings(permissions.allow),
        ask: strings(permissions.ask),
        deny: strings(permissions.deny),
        defaultMode: typeof mode === 'string' ? mode : undefined,
        additionalDirectories: strings(permissions.additionalDirectories),
    };
}
export function analyzeAccess(input) {
    const builtinTools = [];
    const servers = new Map();
    for (const tool of input.tools) {
        const server = tool.mcp ? serverOf(tool.name) ?? 'mcp' : undefined;
        if (server)
            servers.set(server, (servers.get(server) ?? 0) + 1);
        else
            builtinTools.push(tool.name);
    }
    const mcpServers = [...servers].map(([server, tools]) => ({ server, tools }))
        .sort((left, right) => right.tools - left.tools || left.server.localeCompare(right.server));
    const rules = [];
    const hookMap = new Map();
    const pluginMap = new Map();
    let defaultMode = 'default';
    const directories = new Set();
    for (const source of SETTINGS_SOURCES) {
        if (!(source in input.settings))
            continue;
        const settings = input.settings[source];
        const ruleSet = readRuleSet(source, settings);
        if (ruleSet.allow.length + ruleSet.ask.length + ruleSet.deny.length > 0 || ruleSet.defaultMode || ruleSet.additionalDirectories.length > 0) {
            rules.push(ruleSet);
        }
        // Later sources take precedence, as the engine merges them.
        if (ruleSet.defaultMode)
            defaultMode = ruleSet.defaultMode;
        for (const directory of ruleSet.additionalDirectories)
            directories.add(directory);
        for (const [event, count] of Object.entries(countHooks(record(settings).hooks))) {
            const group = hookMap.get(event) ?? { event, count: 0, sources: [] };
            group.count += count;
            group.sources.push(source);
            hookMap.set(event, group);
        }
        for (const [name, isEnabled] of Object.entries(record(record(settings).enabledPlugins))) {
            if (typeof isEnabled === 'boolean')
                pluginMap.set(name, { name, isEnabled, source });
        }
    }
    const hooks = [...hookMap.values()].sort((left, right) => right.count - left.count || left.event.localeCompare(right.event));
    const plugins = [...pluginMap.values()].sort((left, right) => Number(right.isEnabled) - Number(left.isEnabled) || left.name.localeCompare(right.name));
    const commandMap = new Map();
    for (const command of input.commands) {
        const source = command.source === 'plugin' && command.plugin ? `plugin ${command.plugin}` : command.source;
        const group = commandMap.get(source) ?? { source, count: 0, names: [] };
        group.count += 1;
        group.names.push(command.name);
        commandMap.set(source, group);
    }
    const commands = [...commandMap.values()].sort((left, right) => right.count - left.count || left.source.localeCompare(right.source));
    const hookCount = hooks.reduce((total, group) => total + group.count, 0);
    return {
        model: input.model ?? 'unknown model',
        version: input.version ?? '',
        builtinTools: builtinTools.sort((left, right) => left.localeCompare(right)),
        mcpServers,
        totalTools: input.tools.length,
        probes: input.probes,
        rules,
        defaultMode,
        additionalDirectories: [...directories],
        hooks,
        hookCount,
        plugins,
        commands,
        commandCount: input.commands.length,
        flags: findFlags(input.probes, defaultMode, hookCount),
    };
}
function findFlags(probes, defaultMode, hookCount) {
    const flags = [];
    if (defaultMode === 'bypassPermissions')
        flags.push('Permission mode is bypassPermissions: every tool runs without asking.');
    const unattended = probes.filter((probe) => probe.isRisky && probe.verdict === 'allow');
    if (unattended.length > 0) {
        flags.push(`${unattended.length} risky action(s) run without asking: ${unattended.map((probe) => probe.label.toLowerCase()).join(', ')}.`);
    }
    if (hookCount > 0)
        flags.push(`${hookCount} hook command(s) from your settings run on your machine during the session.`);
    return flags;
}
export function riskyAllowed(report) {
    return report.probes.filter((probe) => probe.isRisky && probe.verdict === 'allow');
}
export const VERDICT_LABELS = {
    allow: 'runs without asking',
    ask: 'asks you first',
    deny: 'blocked',
    missing: 'tool not available',
    unknown: 'could not check',
};
export const VERDICT_MARKS = {
    allow: '●',
    ask: '◐',
    deny: '○',
    missing: '·',
    unknown: '?',
};
const ACCESS_ROWS = 15;
function table(headers, rows) {
    const escape = (cell) => cell.replaceAll('|', '\\|');
    if (rows.length === 0)
        return ['_None._'];
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
    ];
}
function capped(items, limit = ACCESS_ROWS) {
    return { shown: items.slice(0, limit), rest: Math.max(0, items.length - limit) };
}
/** The access report as Markdown, for `/cognita access`. */
export function formatAccess(report) {
    const env = [`Model \`${report.model}\``, report.version ? `Claude Code ${report.version}` : '', `permission mode \`${report.defaultMode}\``]
        .filter(Boolean).join(' · ');
    const mcpTools = report.mcpServers.reduce((total, server) => total + server.tools, 0);
    const mcp = capped(report.mcpServers);
    const commands = capped(report.commands, 8);
    const lines = [
        '## What this agent can do',
        '',
        env,
        '',
        ...(report.flags.length === 0
            ? ['No risky action runs without asking.']
            : report.flags.map((flag) => `- **${flag}**`)),
        '',
        '### Actions (asked of the permission system, nothing was run)',
        '',
        ...table(['Action', 'Tool', 'Verdict', 'Why'], report.probes.map((probe) => [
            `${probe.isRisky ? '⚠ ' : ''}${probe.label}`,
            probe.tool,
            `${VERDICT_MARKS[probe.verdict]} ${VERDICT_LABELS[probe.verdict]}`,
            probe.rule ? `rule \`${probe.rule}\`` : probe.reason ?? '',
        ])),
        '',
        `### Tools · ${report.totalTools} (${report.builtinTools.length} built-in, ${mcpTools} from ${report.mcpServers.length} MCP server(s))`,
        '',
        report.builtinTools.length > 0 ? `Built-in: ${report.builtinTools.map((name) => `\`${name}\``).join(', ')}` : 'No built-in tools.',
        '',
        ...table(['MCP server', 'Tools'], mcp.shown.map((server) => [server.server, String(server.tools)])),
        ...(mcp.rest > 0 ? ['', `…and ${mcp.rest} more server(s).`] : []),
        '',
        '### Permission rules by source',
        '',
        ...table(['Source', 'Allow', 'Ask', 'Deny', 'Mode'], report.rules.map((rules) => [rules.label, String(rules.allow.length), String(rules.ask.length), String(rules.deny.length), rules.defaultMode ?? ''])),
        ...ruleLines('Allowed without asking', report.rules.flatMap((rules) => rules.allow)),
        ...ruleLines('Always asks', report.rules.flatMap((rules) => rules.ask)),
        ...ruleLines('Denied', report.rules.flatMap((rules) => rules.deny)),
        ...(report.additionalDirectories.length > 0
            ? ['', `Extra directories it can reach: ${report.additionalDirectories.map((directory) => `\`${directory}\``).join(', ')}`]
            : []),
        '',
        `### Hooks · ${report.hookCount} command(s)`,
        '',
        ...table(['Event', 'Commands', 'Source'], report.hooks.map((group) => [group.event, String(group.count), group.sources.join(', ')])),
        '',
        `### Plugins · ${report.plugins.filter((plugin) => plugin.isEnabled).length} enabled`,
        '',
        ...table(['Plugin', 'State', 'Source'], capped(report.plugins).shown.map((plugin) => [plugin.name, plugin.isEnabled ? 'enabled' : 'disabled', plugin.source])),
        '',
        `### Slash commands · ${report.commandCount}`,
        '',
        ...table(['Source', 'Commands', 'Examples'], commands.shown.map((group) => [group.source, String(group.count), group.names.slice(0, 5).map((name) => `/${name}`).join(' ')])),
        ...(commands.rest > 0 ? ['', `…and ${commands.rest} more source(s).`] : []),
        '',
        '_Verdicts come from Claude Code\'s own permission check for a sample call; a rule for a narrower command can still differ._',
    ];
    return lines.join('\n');
}
function ruleLines(title, rules) {
    if (rules.length === 0)
        return [];
    const shown = capped(rules);
    return ['', `${title}: ${shown.shown.map((rule) => `\`${rule}\``).join(', ')}${shown.rest > 0 ? ` and ${shown.rest} more` : ''}`];
}
export function formatAccessJson(report) {
    return JSON.stringify(report, null, 2);
}
