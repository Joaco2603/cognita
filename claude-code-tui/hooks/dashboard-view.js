import { riskyAllowed } from './access.js';
import { baseTokensOf, meter } from './loadout.js';
import { renderPressureCard } from './pressure-view.js';
import { ACCENT, BORDER, ERROR, OK, WARN, keyHints } from './theme.js';
import { formatTokensShort, isActiveAgent } from './utils.js';
const TABS = [
    { tab: 'overview', label: 'Overview', hotkey: '1' },
    { tab: 'context', label: 'Context', hotkey: '2' },
    { tab: 'access', label: 'Access', hotkey: '3' },
    { tab: 'agents', label: 'Agents', hotkey: '4' },
];
const TAB_HINTS = {
    overview: 'everything at a glance',
    context: 'what fills the window',
    access: 'tools, rules, hooks',
    agents: 'subagents at work',
};
export function renderSidebar(ui, options) {
    const { Box, Button, Text } = ui;
    return Box({
        flexDirection: 'column',
        width: 26,
        rowGap: 1,
        padding: 1,
        borderStyle: 'round',
        borderColor: BORDER,
        children: [
            Box({
                flexDirection: 'column',
                children: [
                    Text({ key: 'brand', children: ['◆ Cognita'], bold: true, color: ACCENT }),
                    Text({ children: ['what your agent sees'], dimColor: true }),
                ],
            }),
            Box({
                key: 'sidebar-project',
                flexDirection: 'column',
                children: [
                    Text({ children: ['PROJECT'], dimColor: true, bold: true }),
                    Text({ children: [options.project || 'unknown'], wrap: 'truncate-middle' }),
                    options.model ? Text({ children: [options.model], dimColor: true, wrap: 'truncate-end' }) : null,
                ],
            }),
            Box({
                flexDirection: 'column',
                children: [
                    Text({ children: ['VIEWS'], dimColor: true, bold: true }),
                    ...TABS.map(({ tab, label, hotkey }) => Button({
                        key: `tab-${tab}`,
                        label: `${options.activeTab === tab ? '▸' : ' '} ${label}`,
                        hotkey,
                        plain: true,
                        bold: options.activeTab === tab,
                        dimColor: options.activeTab !== tab,
                        onPress: () => options.onTabSelect(tab),
                    })),
                ],
            }),
            Text({ key: 'sidebar-hint', children: [TAB_HINTS[options.activeTab]], dimColor: true, wrap: 'wrap' }),
            Text({ children: ['Esc closes'], dimColor: true }),
        ],
    });
}
/** One row of view buttons, for a pane too narrow for the sidebar. */
export function renderTabStrip(ui, options) {
    const { Box, Button, Text } = ui;
    return Box({
        key: 'tab-strip',
        flexDirection: 'row',
        flexWrap: 'wrap',
        columnGap: 2,
        children: [
            Text({ key: 'brand', children: ['◆ Cognita'], bold: true, color: ACCENT }),
            ...TABS.map(({ tab, label, hotkey }) => Button({
                key: `tab-${tab}`,
                label: `${options.activeTab === tab ? '▸' : ' '} ${label}`,
                hotkey,
                plain: true,
                bold: options.activeTab === tab,
                dimColor: options.activeTab !== tab,
                onPress: () => options.onTabSelect(tab),
            })),
        ],
    });
}
export function renderOverview(ui, options) {
    const { Box, Button, Text } = ui;
    const card = (key, title, tab, hotkey, lines, borderColor = BORDER) => Box({
        key,
        flexDirection: 'column',
        padding: 1,
        borderStyle: 'round',
        borderColor,
        children: [
            Box({
                flexDirection: 'row',
                justifyContent: 'space-between',
                children: [
                    Text({ children: [title], bold: true, color: ACCENT }),
                    Button({ key: `${key}-open`, label: `details → ${hotkey}`, plain: true, dimColor: true, onPress: () => options.onOpen(tab) }),
                ],
            }),
            ...lines,
        ],
    });
    const pending = (text) => Text({ children: [options.loading ? 'Measuring…' : text], dimColor: true });
    const loadout = options.loadout;
    const contextLines = loadout
        ? [
            Text({
                key: 'overview-meter',
                children: [`${meter(loadout.percentage, 20)} ${Math.round(loadout.percentage)}% of ${formatTokensShort(loadout.maxTokens)}`],
                color: loadout.percentage >= 80 ? ERROR : loadout.percentage >= 50 ? WARN : OK,
            }),
            Text({ key: 'overview-base', children: [`${formatTokensShort(baseTokensOf(loadout))} tokens load before your first message`] }),
            Text({
                key: 'overview-files',
                children: [`${loadout.memoryFiles.length} instruction files · ${loadout.mcpServers.length} MCP servers · ${loadout.skills.length} skills · ${loadout.agents.length} agent types`],
                dimColor: true,
            }),
            loadout.idleTokens > 0
                ? Text({ key: 'overview-idle', children: [`⚠ ${formatTokensShort(loadout.idleTokens)} tokens loaded but never used this session`], color: WARN })
                : Text({ key: 'overview-idle', children: ['✓ Everything loaded has been used'], color: OK }),
            loadout.levers[0]
                ? Text({ key: 'overview-lever', children: [`Biggest saving: ${loadout.levers[0].text}`], dimColor: true, wrap: 'wrap' })
                : null,
        ]
        : [pending('Not measured yet. Press r.')];
    const access = options.access;
    const risky = access ? riskyAllowed(access) : [];
    const accessLines = access
        ? [
            Text({
                key: 'overview-tools',
                children: [`${access.totalTools} tools · ${access.mcpServers.length} MCP servers · ${access.commandCount} slash commands`],
            }),
            Text({
                key: 'overview-rules',
                children: [`mode ${access.defaultMode} · ${access.rules.reduce((total, rules) => total + rules.allow.length + rules.ask.length + rules.deny.length, 0)} permission rules · ${access.hookCount} hooks · ${access.plugins.filter((plugin) => plugin.isEnabled).length} plugins`],
                dimColor: true,
            }),
            access.policyViolations.length > 0
                ? Text({ key: 'overview-policy', children: [`⚠ ${access.policyViolations.length} policy violation(s): ${access.policyViolations[0]}`], color: WARN, wrap: 'wrap' })
                : null,
            access.policyWarnings.length > 0
                ? Text({ key: 'overview-policy-warning', children: [`⚠ ${access.policyWarnings[0]}`], color: WARN, wrap: 'wrap' })
                : null,
            access.broadRules.length > 0
                ? Text({ key: 'overview-broad', children: [`⚠ ${access.broadRules.length} allow rule(s) too broad, such as ${access.broadRules[0].rule}`], color: WARN, wrap: 'wrap' })
                : null,
            access.defaultMode === 'bypassPermissions'
                ? Text({ key: 'overview-risk', children: ['⚠ bypassPermissions: every tool runs without asking'], color: ERROR })
                : risky.length > 0
                    ? Text({ key: 'overview-risk', children: [`⚠ Runs without asking: ${risky.map((probe) => probe.label.toLowerCase()).join(', ')}`], color: WARN, wrap: 'wrap' })
                    : Text({ key: 'overview-risk', children: ['✓ No risky action runs without asking'], color: OK }),
        ]
        : [pending('Not checked yet. Press r.')];
    const running = options.sessionAgents.filter(isActiveAgent);
    const agentLines = [
        Text({
            key: 'overview-agents',
            children: [options.sessionAgents.length === 0
                    ? 'No subagents in this session yet.'
                    : `${running.length} running · ${options.sessionAgents.length - running.length} finished · ${formatTokensShort(options.sessionAgents.reduce((total, agent) => total + (Number.isFinite(agent.tokenCount) ? agent.tokenCount : 0), 0))} tokens`],
            dimColor: options.sessionAgents.length === 0,
        }),
    ];
    return Box({
        key: 'overview-panel',
        flexDirection: 'column',
        flexGrow: 1,
        rowGap: 1,
        children: [
            Box({
                flexDirection: 'row',
                justifyContent: 'space-between',
                children: [
                    Box({ flexShrink: 1, children: [Text({ children: ['WHAT YOUR AGENT SEES AND CAN DO'], bold: true, wrap: 'truncate-end' })] }),
                    Button({
                        key: 'overview-refresh',
                        label: options.loading ? '↻ Checking…' : '↻ Refresh',
                        hotkey: 'r',
                        plain: true,
                        onPress: options.onRefresh,
                    }),
                ],
            }),
            card('overview-context', 'CONTEXT', 'context', '2', contextLines, loadout && loadout.idleTokens > 0 ? WARN : BORDER),
            options.onCompact
                ? renderPressureCard(ui, {
                    pressure: options.pressure,
                    recommendations: options.recommendations ?? [],
                    tagged: options.tagged,
                    retention: options.retention,
                    loading: options.loading,
                    compacting: options.compacting ?? false,
                    onCompact: options.onCompact,
                })
                : null,
            card('overview-access', 'ACCESS', 'access', '3', accessLines, risky.length > 0 || access?.defaultMode === 'bypassPermissions' ? WARN : BORDER),
            card('overview-agents-card', 'AGENTS', 'agents', '4', agentLines),
            options.error ? Text({ key: 'overview-error', children: [options.error], color: ERROR }) : null,
            keyHints(ui, '1-4 switch views · r refresh · c compact · Esc close · /cognita help for commands'),
        ],
    });
}
