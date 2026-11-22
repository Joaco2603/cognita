// Pure analysis of what a Claude Code session has loaded into its context
// window. No engine calls here, so it is unit-tested directly.
import { basename, formatTokenCount, formatTokensShort } from './utils.js';
export function emptyUsage() {
    return { tools: {}, skills: {} };
}
/** Roughly 4 characters per token, the same rule of thumb /context uses offline. */
export function estimateTokens(chars) {
    return Math.ceil(chars / 4);
}
/** Skills are counted by `recordSkillUse` from `skill.prompt`, which also sees slash-command use. */
export function recordToolCall(usage, tool) {
    usage.tools[tool] = (usage.tools[tool] ?? 0) + 1;
}
export function recordSkillUse(usage, skill) {
    usage.skills[skill] = (usage.skills[skill] ?? 0) + 1;
}
/** MCP tool ids are `mcp__<server>__<tool>`; anything else has no server. */
export function mcpServerOf(tool) {
    if (!tool.startsWith('mcp__'))
        return undefined;
    return tool.slice(5).split('__')[0] || undefined;
}
function skillUses(usage, skill) {
    const plugin = skill.pluginName;
    return (usage.skills[skill.name] ?? 0)
        + (plugin && !skill.name.includes(':') ? usage.skills[`${plugin}:${skill.name}`] ?? 0 : 0);
}
export function summarize(breakdown, usage) {
    const byTokens = (left, right) => right.tokens - left.tokens;
    const isDeferred = (category) => category.kind === 'deferred' || category.isDeferred;
    const categories = breakdown.categories
        .filter((category) => category.kind === 'used' && !isDeferred(category))
        .map(({ name, tokens }) => ({ name, tokens }))
        .sort(byTokens);
    const deferred = breakdown.categories
        .filter((category) => (category.kind === 'used' || category.kind === 'deferred') && isDeferred(category))
        .map(({ name, tokens }) => ({ name: name.replace(/\s*\(deferred\)\s*$/i, ''), tokens }))
        .sort(byTokens);
    const freeTokens = breakdown.categories
        .filter((category) => category.kind === 'free')
        .reduce((total, category) => total + category.tokens, 0);
    const bufferTokens = breakdown.categories
        .filter((category) => category.kind === 'buffer')
        .reduce((total, category) => total + category.tokens, 0);
    const servers = new Map();
    for (const tool of breakdown.mcpTools) {
        const server = servers.get(tool.serverName) ?? {
            server: tool.serverName,
            tokens: 0,
            tools: 0,
            loadedTools: 0,
            calls: 0,
        };
        server.tokens += tool.isLoaded ? tool.tokens : 0;
        server.tools += 1;
        server.loadedTools += tool.isLoaded ? 1 : 0;
        server.calls += usage.tools[tool.name] ?? 0;
        servers.set(tool.serverName, server);
    }
    const mcpServers = [...servers.values()].sort((left, right) => right.tokens - left.tokens || right.tools - left.tools || left.server.localeCompare(right.server));
    const skills = (breakdown.skills?.skillFrontmatter ?? [])
        .map((skill) => ({
        name: skill.name,
        source: skill.source,
        pluginName: skill.pluginName,
        tokens: skill.tokens,
        uses: skillUses(usage, skill),
    }))
        .sort(byTokens);
    const groups = new Map();
    for (const skill of skills) {
        const source = skillSource(skill);
        const group = groups.get(source) ?? { source, skills: 0, tokens: 0, uses: 0 };
        group.skills += 1;
        group.tokens += skill.tokens;
        group.uses += skill.uses;
        groups.set(source, group);
    }
    const skillGroups = [...groups.values()].sort(byTokens);
    const idle = [
        ...mcpServers
            .filter((server) => server.calls === 0 && server.tokens > 0)
            .map((server) => ({ kind: 'mcp', name: server.server, tokens: server.tokens })),
        ...skills
            .filter((skill) => skill.uses === 0 && skill.tokens > 0)
            .map((skill) => ({ kind: 'skill', name: skill.name, tokens: skill.tokens })),
    ].sort(byTokens);
    const memoryFiles = [...breakdown.memoryFiles].sort(byTokens);
    const idleTokens = idle.reduce((total, item) => total + item.tokens, 0);
    return {
        model: breakdown.model,
        totalTokens: breakdown.totalTokens,
        maxTokens: breakdown.maxTokens,
        percentage: breakdown.percentage,
        freeTokens,
        bufferTokens,
        categories,
        deferred,
        deferredTokens: deferred.reduce((total, category) => total + category.tokens, 0),
        memoryFiles,
        mcpServers,
        skills,
        skillGroups,
        agents: [...breakdown.agents].sort(byTokens),
        slashCommands: breakdown.slashCommands,
        idle,
        idleTokens,
        levers: findLevers(mcpServers, skillGroups, memoryFiles),
    };
}
/** Plugin skills group under "plugin <name>"; others under their settings source. */
export function skillSource(skill) {
    return skill.pluginName ? `plugin ${skill.pluginName}` : skill.source;
}
/** Instruction files at or above this size are worth trimming or moving into a skill. */
export const LARGE_INSTRUCTION_FILE = 2000;
/** Savings below this are noise next to a 200k window, so they are not suggested. */
export const MIN_LEVER_TOKENS = 200;
function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
/** The few changes that would free the most context, biggest first. */
export function findLevers(mcpServers, skillGroups, memoryFiles, limit = 5) {
    const code = (text) => '`' + text + '`';
    const levers = [
        ...mcpServers
            .filter((server) => server.calls === 0 && server.tokens > 0)
            .map((server) => ({
            key: `mcp-${server.server}`,
            kind: 'mcp',
            target: server.server,
            text: `Hold MCP server ${code(server.server)} for this project (${plural(server.loadedTools, 'loaded tool')}, no calls)`,
            tokens: server.tokens,
        })),
        ...skillGroups
            .filter((group) => group.source.startsWith('plugin ') && group.uses === 0 && group.tokens > 0)
            .map((group) => ({
            key: `skills-${group.source}`,
            kind: 'plugin',
            target: group.source.slice('plugin '.length),
            text: `Disable plugin ${code(group.source.slice('plugin '.length))} (${plural(group.skills, 'skill')}, none used)`,
            tokens: group.tokens,
        })),
        ...memoryFiles
            .filter((file) => file.tokens >= LARGE_INSTRUCTION_FILE)
            .map((file) => ({
            key: `file-${file.path}`,
            kind: 'file',
            target: file.path,
            text: `Trim ${code(shortPath(file.path))} or move rarely needed parts into a skill (it loads every turn)`,
            tokens: file.tokens,
        })),
    ];
    return levers.filter((lever) => lever.tokens >= MIN_LEVER_TOKENS).sort((left, right) => right.tokens - left.tokens).slice(0, limit);
}
export function measurePrompt(sections, blocks, instructionFiles = []) {
    return {
        sections: sections.map((section) => ({ id: section.id, scope: section.scope, chars: section.text.length })),
        blocks: blocks.map((block) => ({ name: block.name, chars: block.text.length })),
        instructionFiles: instructionFiles.map((file) => ({ path: file.path, kind: file.kind, chars: file.content.length })),
    };
}
/** Sections a plugin added to the system prompt carry a `<plugin>:<name>` id. */
export function pluginSections(capture) {
    return capture.sections.filter((section) => section.id.includes(':'));
}
/** `[████░░░░]` meter for a 0 to 100 percentage. */
export function meter(percent, width = 20) {
    const clamped = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    const filled = Math.round((clamped / 100) * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}
export function share(tokens, total) {
    if (total <= 0)
        return '0%';
    const percent = (tokens / total) * 100;
    return percent > 0 && percent < 1 ? '<1%' : `${Math.round(percent)}%`;
}
function table(headers, rows) {
    if (rows.length === 0)
        return ['_None._'];
    return [
        `| ${headers.join(' | ')} |`,
        `| ${headers.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.map((cell) => cell.replaceAll('|', '\\|')).join(' | ')} |`),
    ];
}
/** Long lists in the report stop here; the pane and the totals keep everything. */
export const REPORT_ROWS = 15;
/** Markdown report for `/inspector report`: paste-able into an issue or PR. */
export function formatReport(loadout, prompt, usage, since, budget) {
    const tokens = formatTokenCount;
    const base = baseTokensOf(loadout);
    const lines = [
        '## Session loadout',
        '',
        `Model \`${loadout.model}\` · ${tokens(loadout.totalTokens)} / ${tokens(loadout.maxTokens)} tokens (${Math.round(loadout.percentage)}%) · ${tokens(loadout.freeTokens)} free`,
        ...(budget === undefined
            ? []
            : ['', base > budget
                    ? `**Over budget:** ${tokens(base)} tokens load before any message, ${tokens(base - budget)} over the ${tokens(budget)} budget.`
                    : `Within budget: ${tokens(base)} of ${tokens(budget)} tokens load before any message.`]),
        '',
        '### Biggest levers',
        '',
        ...(loadout.levers.length === 0
            ? ['Nothing stands out: every loaded MCP server and plugin has been used, and no instruction file is large.']
            : loadout.levers.map((lever) => `- ${lever.text}: frees ~${tokens(lever.tokens)} tokens`)),
        ...(since === undefined ? [] : ['', '### Since last session', '', ...formatDiff(since === 'first' ? undefined : since)]),
        '',
        '### Context window',
        '',
        ...table(['Category', 'Tokens', 'Share'], loadout.categories.map((category) => [
            category.name,
            tokens(category.tokens),
            share(category.tokens, loadout.maxTokens),
        ])),
        ...(loadout.deferredTokens > 0
            ? ['', `Deferred, outside the window until loaded: ${loadout.deferred.map((category) => `${category.name} ${tokens(category.tokens)}`).join(', ')}.`]
            : []),
        '',
        '### Instruction files (CLAUDE.md, rules, memory)',
        '',
        ...table(['File', 'Type', 'Tokens'], loadout.memoryFiles.map((file) => [file.path, file.type, tokens(file.tokens)])),
        '',
        '### MCP servers',
        '',
        ...table(['Server', 'Tools loaded / total', 'Tokens', 'Calls this session'], loadout.mcpServers.map((server) => [
            server.server,
            `${server.loadedTools} / ${server.tools}`,
            tokens(server.tokens),
            String(server.calls),
        ])),
        '',
        '### Skills by source',
        '',
        ...table(['Source', 'Skills', 'Tokens', 'Uses'], loadout.skillGroups.map((group) => [group.source, String(group.skills), tokens(group.tokens), String(group.uses)])),
        '',
        `### Heaviest skills${loadout.skills.length > REPORT_ROWS ? ` (top ${REPORT_ROWS} of ${loadout.skills.length})` : ''}`,
        '',
        ...table(['Skill', 'Source', 'Tokens', 'Uses'], loadout.skills.slice(0, REPORT_ROWS).map((skill) => [
            skill.name,
            skill.pluginName ? `${skill.source} (${skill.pluginName})` : skill.source,
            tokens(skill.tokens),
            String(skill.uses),
        ])),
    ];
    if (loadout.agents.length > 0) {
        lines.push('', '### Custom agents', '', ...table(['Agent', 'Source', 'Tokens'], loadout.agents.map((agent) => [agent.agentType, agent.source, tokens(agent.tokens)])));
    }
    if (prompt && prompt.sections.length > 0) {
        lines.push('', '### System prompt sections (last composed)', '', ...table(['Section', 'Scope', '≈ Tokens'], prompt.sections.map((section) => [section.id, section.scope, tokens(estimateTokens(section.chars))])));
    }
    lines.push('', '### Loaded but unused this session', '');
    if (loadout.idle.length === 0) {
        lines.push('Everything loaded has been used at least once.');
    }
    else {
        lines.push(`${tokens(loadout.idleTokens)} tokens are spent on items not used yet. Consider disabling them for this project:`, '', ...loadout.idle.slice(0, REPORT_ROWS).map((item) => `- ${item.kind === 'mcp' ? 'MCP server' : 'Skill'} \`${item.name}\`: ${tokens(item.tokens)} tokens`));
    }
    const rest = loadout.idle.slice(REPORT_ROWS);
    if (rest.length > 0) {
        lines.push(`- …and ${rest.length} more (${tokens(rest.reduce((total, item) => total + item.tokens, 0))} tokens)`);
    }
    const toolCalls = Object.values(usage.tools).reduce((total, count) => total + count, 0);
    lines.push('', `_${toolCalls} tool calls observed since the plugin loaded._`);
    return lines.join('\n');
}
/** Short label for a memory file path: its last two segments. */
export function shortPath(path) {
    const parts = path.split(/[\\/]/).filter(Boolean);
    return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}` || basename(path);
}
export const TREND_LENGTH = 20;
/** Changes smaller than this are noise between two measurements. */
export const MIN_CHANGE_TOKENS = 50;
const isConversation = (name) => /^messages$/i.test(name);
export function toSnapshot(loadout, sessionId, at = new Date().toISOString()) {
    const items = {};
    for (const category of loadout.categories) {
        if (!isConversation(category.name))
            items[`category:${category.name}`] = category.tokens;
    }
    for (const server of loadout.mcpServers)
        items[`mcp:${server.server}`] = server.tokens;
    for (const group of loadout.skillGroups)
        items[`skills:${group.source}`] = group.tokens;
    for (const file of loadout.memoryFiles)
        items[`file:${file.path}`] = file.tokens;
    return {
        shape: 'loadout-1',
        sessionId,
        at,
        model: loadout.model,
        baseTokens: baseTokensOf(loadout),
        items,
    };
}
function isSnapshot(value) {
    const snapshot = value;
    return snapshot?.shape === 'loadout-1' && typeof snapshot.sessionId === 'string' && typeof snapshot.items === 'object' && snapshot.items !== null;
}
/**
 * Folds this session's snapshot into what the store holds for the project.
 * The baseline is the last snapshot of another session, so measuring twice,
 * or reloading the plugin, never compares a session with itself.
 */
export function rememberSnapshot(stored, snapshot) {
    const history = stored;
    const current = isSnapshot(history?.current) ? history.current : undefined;
    const previous = isSnapshot(history?.previous) ? history.previous : undefined;
    const baseline = current && current.sessionId !== snapshot.sessionId ? current : previous;
    const point = { sessionId: snapshot.sessionId, at: snapshot.at, model: snapshot.model, baseTokens: snapshot.baseTokens };
    const earlier = (Array.isArray(history?.trend) ? history.trend : [])
        .filter(isTrendPoint)
        .filter((entry) => entry.sessionId !== snapshot.sessionId);
    const trend = [...earlier, point].slice(-TREND_LENGTH);
    return { history: { current: snapshot, previous: baseline, trend }, baseline };
}
function isTrendPoint(value) {
    const point = value;
    return typeof point?.sessionId === 'string' && typeof point.at === 'string' && typeof point.baseTokens === 'number';
}
/** The trend a stored history holds, oldest first; empty for anything unreadable. */
export function trendOf(stored) {
    const trend = stored?.trend;
    return Array.isArray(trend) ? trend.filter(isTrendPoint) : [];
}
const SPARK = '▁▂▃▄▅▆▇█';
/** One block per value, scaled between the smallest and largest. */
export function sparkline(values) {
    if (values.length === 0)
        return '';
    const low = Math.min(...values);
    const high = Math.max(...values);
    const step = (high - low) / (SPARK.length - 1);
    return values.map((value) => SPARK[step === 0 ? 3 : Math.round((value - low) / step)]).join('');
}
const signed = (tokens) => (tokens > 0 ? '+' : tokens < 0 ? '-' : '±') + Math.abs(tokens).toLocaleString('en-US');
/** Markdown for `/inspector history`: how the loadout moved across this project's sessions. */
export function formatHistory(trend, currentSessionId, budget, 
/** Cost in USD per session id, plus an optional summary line; adds a `$` column. */
costs, spend) {
    if (trend.length === 0)
        return 'No measurements saved for this project yet.';
    const values = trend.map((point) => point.baseTokens);
    const first = trend[0];
    const last = trend[trend.length - 1];
    const lines = [
        '## Loadout history',
        '',
        `Tokens that load before the first message, over the last ${trend.length} session${trend.length === 1 ? '' : 's'} in this project.`,
        '',
        '`' + sparkline(values) + '`  ' + `${formatTokensShort(Math.min(...values))} to ${formatTokensShort(Math.max(...values))}`,
        '',
    ];
    if (trend.length > 1) {
        lines.push(`**Overall:** ${signed(last.baseTokens - first.baseTokens)} tokens since ${formatWhen(first.at)}.`, '');
    }
    if (budget) {
        const over = trend.filter((point) => point.baseTokens > budget).length;
        lines.push(`**Budget:** ${over} of ${trend.length} sessions went over ${budget.toLocaleString('en-US')} tokens.`, '');
    }
    if (spend && costs)
        lines.push(`**${spend}**`, '');
    lines.push(costs ? '| When | Model | Tokens | Change | $ |' : '| When | Model | Tokens | Change |', costs ? '| --- | --- | ---: | ---: | ---: |' : '| --- | --- | ---: | ---: |');
    const rows = trend.map((point, index) => {
        const change = index === 0 ? '' : signed(point.baseTokens - trend[index - 1].baseTokens);
        const when = formatWhen(point.at) + (point.sessionId === currentSessionId ? ' (this session)' : '');
        const cost = costs ? ` ${point.sessionId in costs ? '$' + costs[point.sessionId].toFixed(2) : ''} |` : '';
        return `| ${when} | ${point.model || 'unknown'} | ${point.baseTokens.toLocaleString('en-US')} | ${change} |${cost}`;
    });
    lines.push(...rows.reverse());
    return lines.join('\n');
}
const formatWhen = (at) => at.slice(0, 16).replace('T', ' ') + ' UTC';
export function diffLoadout(before, after) {
    const changes = [];
    for (const id of new Set([...Object.keys(before.items), ...Object.keys(after.items)])) {
        const was = before.items[id] ?? 0;
        const now = after.items[id] ?? 0;
        if (Math.abs(now - was) < MIN_CHANGE_TOKENS)
            continue;
        const split = id.indexOf(':');
        changes.push({ kind: id.slice(0, split), name: id.slice(split + 1), before: was, after: now, delta: now - was });
    }
    changes.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
    return {
        since: before.at,
        model: before.model === after.model ? undefined : { before: before.model, after: after.model },
        baseBefore: before.baseTokens,
        baseAfter: after.baseTokens,
        changes,
    };
}
const CHANGE_LABEL = {
    category: 'Category',
    mcp: 'MCP server',
    skills: 'Skills from',
    file: 'File',
};
/** One line for a change: `MCP server linear: added, 3,000 tokens`. */
export function describeChange(change) {
    const tokens = formatTokenCount;
    const name = change.kind === 'file' ? shortPath(change.name) : change.name;
    const what = change.before === 0
        ? `added, ${tokens(change.after)} tokens`
        : change.after === 0
            ? `removed, was ${tokens(change.before)} tokens`
            : `${change.delta > 0 ? '+' : '-'}${tokens(Math.abs(change.delta))} tokens (${tokens(change.before)} → ${tokens(change.after)})`;
    return `${CHANGE_LABEL[change.kind]} ${name}: ${what}`;
}
/** Markdown lines for the report's comparison section. */
export function formatDiff(diff) {
    if (!diff)
        return ['First measurement in this project: the next session will be compared with this one.'];
    const tokens = formatTokenCount;
    const delta = diff.baseAfter - diff.baseBefore;
    const lines = [
        `Loaded before any message: ${tokens(diff.baseAfter)} tokens, ${delta === 0 ? 'unchanged' : `${delta > 0 ? '+' : '-'}${tokens(Math.abs(delta))}`} since ${diff.since.slice(0, 16).replace('T', ' ')} UTC.`,
    ];
    if (diff.model)
        lines.push('', `Model changed: \`${diff.model.before}\` → \`${diff.model.after}\`.`);
    lines.push('', ...(diff.changes.length === 0
        ? ['No change of 50 tokens or more.']
        : diff.changes.slice(0, REPORT_ROWS).map((change) => `- ${describeChange(change)}`)));
    return lines;
}
/** Tokens a session loads before any message: every category in the window but Messages. */
export function baseTokensOf(loadout) {
    return loadout.categories.filter((category) => !isConversation(category.name)).reduce((total, category) => total + category.tokens, 0);
}
/** Reads a token amount from a setting: `30000`, `30k`, `1.5M`. Anything else is unset. */
export function parseTokens(value) {
    const match = value?.trim().toLowerCase().replaceAll(',', '').replaceAll('_', '').match(/^(\d+(?:\.\d+)?)\s*([km]?)$/);
    if (!match)
        return undefined;
    return Math.round(Number(match[1]) * (match[2] === 'm' ? 1_000_000 : match[2] === 'k' ? 1000 : 1));
}
/** Default growth that is worth a toast: about one mid-sized MCP server. */
export const DEFAULT_GROWTH_ALERT = 2000;
/**
 * The one-line warning a session start may raise, or undefined when nothing
 * is worth interrupting for. Over budget wins over growth.
 */
export function startupAlert(loadout, since, settings) {
    const base = baseTokensOf(loadout);
    const diff = since === 'first' ? undefined : since;
    const grew = diff ? diff.baseAfter - diff.baseBefore : 0;
    // Name a server, plugin or file over a whole category: that is what someone can act on.
    const top = diff?.changes.find((change) => change.delta > 0 && change.kind !== 'category')
        ?? diff?.changes.find((change) => change.delta > 0);
    const cause = top ? `, mostly ${describeChange(top).replace(/: .*$/, '')} ${top.before === 0 ? '(new)' : `+${formatTokensShort(top.delta)}`}` : '';
    if (settings.budget !== undefined && base > settings.budget) {
        return `Context loadout ${formatTokensShort(base)} is over your ${formatTokensShort(settings.budget)} budget${grew > 0 ? ` (+${formatTokensShort(grew)} since last session${cause})` : ''}. Run /inspector context to see the levers.`;
    }
    if (settings.growth > 0 && grew >= settings.growth) {
        return `Context loadout grew +${formatTokensShort(grew)} since last session${cause}. Run /inspector report for details.`;
    }
    return undefined;
}
/** Short status-line suffix for the change since the last session: `+3.4k`, or nothing. */
export function sinceBadge(since) {
    if (!since || since === 'first')
        return '';
    const grew = since.baseAfter - since.baseBefore;
    if (Math.abs(grew) < MIN_CHANGE_TOKENS)
        return '';
    return `${grew > 0 ? '+' : '-'}${formatTokensShort(Math.abs(grew))} vs last`;
}
/** Machine-readable report for scripts and CI: `/inspector report json`. */
export function formatJson(loadout, since, settings) {
    const base = baseTokensOf(loadout);
    return JSON.stringify({
        shape: 'inspector-report-1',
        model: loadout.model,
        window: { used: loadout.totalTokens, max: loadout.maxTokens, percent: loadout.percentage, free: loadout.freeTokens },
        baseTokens: base,
        budget: settings.budget === undefined ? null : { tokens: settings.budget, isOver: base > settings.budget },
        categories: loadout.categories,
        deferred: loadout.deferred,
        memoryFiles: loadout.memoryFiles,
        mcpServers: loadout.mcpServers,
        skillGroups: loadout.skillGroups,
        levers: loadout.levers,
        idle: loadout.idle,
        sinceLastSession: since === undefined ? null : since === 'first' ? { isFirst: true } : since,
    }, null, 2);
}
/** The levers a trim plan lists, and `/cognita trim --apply` acts on. */
export function trimLevers(loadout) {
    return findLevers(loadout.mcpServers, loadout.skillGroups, loadout.memoryFiles, 10);
}
/** How to pull one lever, as Markdown lines under its numbered step. */
function leverSteps(lever) {
    if (lever.kind === 'plugin') {
        return [
            '   ```sh',
            `   claude plugin disable ${lever.target} --scope local`,
            '   ```',
            `   Only this project. Undo with \`claude plugin enable ${lever.target} --scope local\`.`,
        ];
    }
    if (lever.kind === 'mcp') {
        return [
            '   ```',
            `   /cognita hold ${lever.target}`,
            '   ```',
            `   From the next session in this project; \`/cognita connect ${lever.target}\` brings it back any time.`,
        ];
    }
    return [`   Open \`${lever.target}\` and move the sections you rarely need into a skill, which loads only when used.`];
}
/**
 * Markdown for `/inspector trim`: every lever as a step with the command that
 * pulls it, a running total, and where that leaves the loadout against the budget.
 */
export function formatTrimPlan(loadout, budget) {
    const tokens = (count) => count.toLocaleString('en-US');
    const base = baseTokensOf(loadout);
    const levers = trimLevers(loadout);
    const lines = ['## Trim plan', '', `Loaded before any message: **${tokens(base)} tokens**${budget ? ` (budget ${tokens(budget)})` : ''}.`, ''];
    if (levers.length === 0) {
        lines.push('Nothing to trim: every loaded MCP server and plugin has been used in this session, and no instruction file is large.');
        return lines.join('\n');
    }
    let freed = 0;
    let reachedBudget = 0;
    levers.forEach((lever, index) => {
        freed += lever.tokens;
        if (budget && !reachedBudget && base - freed <= budget)
            reachedBudget = index + 1;
        lines.push(`${index + 1}. ${lever.text}: frees ~${tokens(lever.tokens)} (total ~${tokens(freed)})`, ...leverSteps(lever), '');
    });
    const after = base - freed;
    lines.push(`**All ${levers.length} steps:** ${tokens(base)} to ~${tokens(after)} tokens (-${Math.round((freed / Math.max(base, 1)) * 100)}%).`);
    if (budget) {
        if (base <= budget)
            lines.push('', 'Already within budget; these steps only add headroom.');
        else if (reachedBudget)
            lines.push('', `The first ${reachedBudget === 1 ? 'step brings' : `${reachedBudget} steps bring`} the loadout within budget.`);
        else
            lines.push('', `Still ~${tokens(after - budget)} over budget after every step: look at System tools and Skills in \`/inspector report\`.`);
    }
    lines.push('', 'Run `/cognita trim --apply` to do the plugin and MCP steps for you (instruction files stay manual).');
    lines.push('', '_"Unused" means no calls in this session so far. Measure after real work, not at startup._');
    return lines.join('\n');
}
