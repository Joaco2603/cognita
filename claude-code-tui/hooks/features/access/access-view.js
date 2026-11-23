import { VERDICT_LABELS, VERDICT_MARKS } from './access.js';
import { slug } from '../../core/utils.js';
import { ACCENT, BORDER, ERROR, OK, WARN, keyHints } from '../../core/theme.js';
const MAX_ROWS = 12;
const VERDICT_COLORS = {
    allow: OK,
    ask: WARN,
    deny: ERROR,
    missing: undefined,
    unknown: undefined,
};
export function renderAccess(ui, options) {
    const { Box, Button, Text } = ui;
    const heading = (text) => Text({ children: [text], dimColor: true, bold: true });
    const dim = (key, text) => Box({ key, children: [Text({ children: [text], dimColor: true })] });
    const row = (key, label, value, color, extra) => Box({
        key,
        flexDirection: 'row',
        columnGap: 1,
        children: [
            Box({ flexGrow: 1, flexShrink: 1, children: [Text({ children: [label], wrap: 'truncate-end' })] }),
            Box({ flexShrink: 0, children: [Text({ children: [value], bold: true, color })] }),
            extra === undefined ? null : Text({ children: [extra], dimColor: true }),
        ],
    });
    const more = (count) => count > MAX_ROWS ? Text({ children: [`… ${count - MAX_ROWS} more (see /cognita access)`], dimColor: true }) : null;
    const menuButton = (subview, label, hotkey) => Button({
        key: `access-menu-${subview}`,
        label: `${options.subview === subview ? '▸ ' : '  '}${label}`,
        hotkey,
        plain: true,
        dimColor: options.subview !== subview,
        onPress: () => options.onSubviewChange(subview),
    });
    const refresh = Button({
        key: 'access-refresh',
        label: options.loading ? '↻ Checking…' : '↻ Check again',
        hotkey: 'r',
        plain: true,
        onPress: options.onRefresh,
    });
    const frame = (children) => Box({
        key: 'access-panel',
        flexDirection: 'column',
        flexGrow: 1,
        rowGap: 1,
        padding: 1,
        borderStyle: 'round',
        borderColor: BORDER,
        children,
    });
    const access = options.access;
    if (!access) {
        return frame([
            Text({ children: ['WHAT YOUR AGENT CAN DO'], bold: true, color: ACCENT }),
            Text({ children: ['The tools it can call, which risky actions run without asking, and the rules, hooks and plugins behind that.'] }),
            Text({ children: [options.loading ? 'Checking permissions… (nothing is run)' : 'Press r to check.'], dimColor: true }),
            refresh,
            options.error ? Box({ key: 'access-error', children: [Text({ children: [options.error], color: ERROR })] }) : null,
        ]);
    }
    const mcpTools = access.mcpServers.reduce((total, server) => total + server.tools, 0);
    const enabledPlugins = access.plugins.filter((plugin) => plugin.isEnabled);
    const header = Box({
        key: 'access-header',
        flexDirection: 'column',
        children: [
            Box({
                flexDirection: 'row',
                columnGap: 1,
                children: [
                    Text({ children: ['WHAT YOUR AGENT CAN DO'], bold: true, color: ACCENT }),
                    Text({ children: [`mode ${access.defaultMode}`], dimColor: true }),
                ],
            }),
            Text({
                key: 'access-summary',
                children: [`${access.totalTools} tools · ${access.mcpServers.length} MCP servers · ${access.hookCount} hooks · ${enabledPlugins.length} plugins · checked at ${options.checkedAt}`],
                dimColor: true,
            }),
        ],
    });
    const flags = access.flags.length === 0
        ? [Text({ key: 'access-flag-none', children: ['✓ No risky action runs without asking.'], color: OK })]
        : access.flags.map((flag, index) => Text({ key: `access-flag-${index}`, children: [`⚠ ${flag}`], color: flag.includes('bypassPermissions') ? ERROR : WARN }));
    const policyWarnings = access.policyWarnings.map((warning, index) => Text({ key: `access-policy-warning-${index}`, children: [`⚠ ${warning}`], color: WARN, wrap: 'wrap' }));
    let body;
    switch (options.subview) {
        case 'tools':
            body = [
                heading(`BUILT-IN TOOLS · ${access.builtinTools.length}`),
                Text({ key: 'access-builtin', children: [access.builtinTools.join('  ') || 'None.'], wrap: 'wrap' }),
                heading(`MCP SERVERS · ${access.mcpServers.length}  (${mcpTools} tools)`),
                ...access.mcpServers.slice(0, MAX_ROWS).map((server) => row(`access-mcp-${slug(server.server)}`, server.server, `${server.tools} tools`)),
                access.mcpServers.length === 0 ? dim('access-mcp-none', 'No MCP server tools in this session.') : null,
                more(access.mcpServers.length),
                access.mcpAccess.length > 0 ? heading('MCP TOOLS THAT RUN WITHOUT ASKING') : null,
                ...access.mcpAccess.slice(0, MAX_ROWS).map((server) => row(`access-mcp-access-${slug(server.server)}`, server.server, `${server.allowed.length}/${server.checked}`, server.allowed.length > 0 ? WARN : OK, server.allowed.slice(0, 3).join(', '))),
                heading(`SLASH COMMANDS · ${access.commandCount}`),
                ...access.commands.slice(0, 6).map((group) => row(`access-commands-${slug(group.source)}`, group.source, String(group.count))),
            ];
            break;
        case 'rules': {
            const all = access.rules.flatMap((rules) => [
                ...rules.allow.map((rule) => ({ rule, kind: 'allow', source: rules.source })),
                ...rules.ask.map((rule) => ({ rule, kind: 'ask', source: rules.source })),
                ...rules.deny.map((rule) => ({ rule, kind: 'deny', source: rules.source })),
            ]);
            body = [
                heading(`PERMISSION RULES · ${all.length}`),
                ...all.slice(0, MAX_ROWS).map((entry, index) => row(`access-rule-${index}`, entry.rule, entry.kind, VERDICT_COLORS[entry.kind], entry.source)),
                all.length === 0 ? dim('access-rules-none', 'No allow, ask or deny rules in any settings file.') : null,
                more(all.length),
                access.additionalDirectories.length > 0 ? heading('EXTRA DIRECTORIES') : null,
                ...access.additionalDirectories.slice(0, 6).map((directory) => Text({ key: `access-dir-${slug(directory)}`, children: [directory], wrap: 'truncate-middle' })),
                access.broadRules.length > 0 ? heading('TOO BROAD') : null,
                ...access.broadRules.slice(0, 6).map((item, index) => row(`access-broad-${index}`, item.rule, item.source, WARN, item.why)),
                heading('WHERE THEY COME FROM'),
                ...access.rules.map((rules) => row(`access-source-${rules.source}`, rules.label, `${rules.allow.length}/${rules.ask.length}/${rules.deny.length}`, undefined, rules.defaultMode ? `mode ${rules.defaultMode}` : 'allow/ask/deny')),
                access.rules.length === 0 ? dim('access-sources-none', 'Every settings file is empty of permission rules.') : null,
            ];
            break;
        }
        case 'hooks':
            body = [
                heading(`HOOKS · ${access.hookCount} commands`),
                ...access.hooks.slice(0, MAX_ROWS).map((group) => row(`access-hook-${slug(group.event)}`, group.event, String(group.count), WARN, group.sources.join(', '))),
                access.hooks.length === 0 ? dim('access-hooks-none', 'No hooks in your settings files.') : null,
                heading(`PLUGINS · ${enabledPlugins.length} enabled`),
                ...access.plugins.slice(0, MAX_ROWS).map((plugin) => row(`access-plugin-${slug(plugin.name)}`, plugin.name, plugin.isEnabled ? 'on' : 'off', plugin.isEnabled ? OK : undefined, plugin.source)),
                access.plugins.length === 0 ? dim('access-plugins-none', 'No plugins listed in your settings files.') : null,
                more(access.plugins.length),
            ];
            break;
        default:
            body = [
                ...flags,
                ...policyWarnings,
                heading('ACTIONS  (asked of the permission system, nothing was run)'),
                ...access.probes.map((probe) => row(`access-probe-${probe.key}`, `${VERDICT_MARKS[probe.verdict]} ${probe.label}${probe.isRisky ? ' ⚠' : ''}`, VERDICT_LABELS[probe.verdict], probe.isRisky && probe.verdict === 'allow' ? WARN : VERDICT_COLORS[probe.verdict])),
                Text({ children: ['● runs without asking   ◐ asks you first   ○ blocked'], dimColor: true }),
            ];
    }
    return frame([
        header,
        Box({
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: 2,
            children: [
                menuButton('actions', 'Actions', 'a'),
                menuButton('tools', 'Tools', 't'),
                menuButton('rules', 'Rules', 'u'),
                menuButton('hooks', 'Hooks & plugins', 'k'),
            ],
        }),
        Box({ flexDirection: 'column', children: body }),
        refresh,
        options.error ? Box({ key: 'access-error', children: [Text({ children: [options.error], color: ERROR })] }) : null,
        keyHints(ui, 'a t u k subviews · r check again · /cognita access for the full report'),
    ]);
}
