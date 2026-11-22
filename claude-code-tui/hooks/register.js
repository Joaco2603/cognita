import { analyzeAccess, formatAccess, formatAccessJson, MCP_PROBE_LIMIT, PROBES, SETTINGS_SOURCES } from './access.js';
import { customProbes, mergeAlerts, parsePolicy, policyReadFailure, POLICY_FILE } from './policy.js';
import { renderAccess } from './access-view.js';
import { analyzeSupplyChain, formatSupplyChain, formatSupplyChainJson } from './supply-chain.js';
import { checkCompatibility, compatLine, probeEngine, compatToast, formatDoctor } from './compat.js';
import { renderAgents } from './agents-view.js';
import { renderContext } from './context-view.js';
import { budgetStatus, budgetWarning, costBySession, costJson, costsOf, dayKey, formatCost, recordCost, spendLine, } from './cost.js';
import { renderOverview, renderSidebar, renderTabStrip } from './dashboard-view.js';
import { createLazyMcp } from './lazy-mcp.js';
import { DEFAULT_GROWTH_ALERT, diffLoadout, emptyUsage, formatHistory, formatJson, formatTrimPlan, formatReport, mcpServerOf, measurePrompt, recordSkillUse, recordToolCall, parseTokens, rememberSnapshot, sinceBadge, startupAlert, summarize, toSnapshot, trendOf, } from './loadout.js';
import { DEFAULT_PRESSURE, applyPlanCall, compactFocus, engramPrompt, engramSaveTool, formatPressure, formatPressureJson, isPlanTool, parsePressureSettings, planFromMessages, pressureAlert, pressureBadge, pressureOf, promptsOf, recommend, splitPrompt, } from './pressure.js';
import { extractTagged, focusOf, formatRetention, formatTagged, mergeTagged, retentionAlert, retentionOf, withTaggedInstructions, } from './tags.js';
import { basename, } from './utils.js';
const PANE_ID = 'cognita';
const COMMAND_NAME = 'cognita';
/** The name earlier versions used; it keeps working. */
const LEGACY_COMMAND_NAME = 'inspector';
const HELP = [
    '**/cognita** · see what your agent has loaded and what it can do',
    '',
    '- `/cognita`: open the Cognita pane (Overview, Context, Access, Agents)',
    '- `/cognita access`: what the agent can reach: tools, MCP servers, risky actions, permission rules, hooks, plugins',
    '- `/cognita access json`: the same as JSON',
    '- `/cognita supply`: every hook and MCP server that runs code here, and whether it is pinned to a version (`json` for scripts)',
    '- `/cognita report`: what this session has loaded into context (estimated; `full` for an exact count, `json` for scripts)',
    '- `/cognita trim`: a step-by-step plan, with commands, to shrink what loads before the first message',
    '- `/cognita history`: how the loadout changed across the last sessions in this project',
    '- `/cognita cost`: what sessions cost in dollars in this project, per day and per session (`json` for scripts)',
    '- `/cognita pressure`: how hard the context is working (window plus an attention estimate) and the step that relieves it (`json` for scripts)',
    '- `/cognita compact`: compact now, keeping the goal and the open plan',
    '- `/cognita save` · `/cognita split`: send the prompt that saves decisions to Engram, or that hands the plan to subagents',
    '- `/cognita context` · `/cognita access open`: open the pane on that view',
    '- `/cognita hold [server]`: keep an MCP server off from the next session in this project (no name lists the held ones)',
    '- `/cognita connect [server]`: bring a held server back for this session (no name connects every held one)',
    '- `/cognita release <server|all>`: stop holding it, so it loads at every start again',
    '- `/cognita doctor`: which Claude Code engine APIs Cognita needs, and which this version lacks',
    '- `/cognita help`: this list',
    '',
    '`/inspector` is an alias of `/cognita`.',
].join('\n');
function createState() {
    return {
        activeTab: 'overview',
        agentSubview: 'active',
        contextSubview: 'overview',
        accessSubview: 'actions',
        currentDirectory: '',
        model: '',
        agentSearch: '',
        selectedAgentId: '',
        agentPrompt: '',
        sessionAgents: [],
        agentError: '',
        loadingAgents: false,
        launchingAgent: false,
        isStatusLineEnabled: true,
        alerts: { growth: DEFAULT_GROWTH_ALERT },
        costSaved: -1,
        costSavedPartial: false,
        costWrite: Promise.resolve(),
        policy: { require: {}, actions: [] },
        policyWarnings: [],
        usageLog: emptyUsage(),
        loadoutDetail: 'summary',
        measuredAt: '',
        measuring: false,
        contextError: '',
        lazy: createLazyMcp(),
        lazyView: { held: [], unusedSessions: {} },
        promptSections: [],
        promptBlocks: [],
        instructionFiles: [],
        accessCheckedAt: '',
        checkingAccess: false,
        accessError: '',
        plan: [],
        hasPlan: false,
        recommendations: [],
        pressureSettings: DEFAULT_PRESSURE,
        pressureLevel: 'ok',
        checkingPressure: false,
        compacting: false,
        tagged: [],
    };
}
function promptCapture(state) {
    return state.promptSections.length > 0 || state.promptBlocks.length > 0
        ? measurePrompt(state.promptSections, state.promptBlocks, state.instructionFiles)
        : undefined;
}
function applyLoadout(state, measured, detail) {
    state.loadout = measured.loadout;
    state.since = measured.since ?? state.since;
    state.loadoutDetail = detail;
    if (!state.model && measured.loadout.model)
        state.model = measured.loadout.model;
    state.measuredAt = new Date().toLocaleTimeString();
    return measured.loadout;
}
function applyAccess(state, report) {
    state.access = report;
    state.accessCheckedAt = new Date().toLocaleTimeString();
    if (report.model && report.model !== 'unknown model')
        state.model = report.model;
    return report;
}
async function refreshLoadout($, state, detail) {
    if (state.measuring)
        return;
    state.measuring = true;
    state.contextError = '';
    $.ui.invalidate('ui.render');
    try {
        applyLoadout(state, await readLoadout($, detail, state.usageLog, state.currentDirectory, state.lazy), detail);
    }
    catch {
        state.contextError = 'Could not measure the context window for this session.';
    }
    finally {
        state.measuring = false;
        $.ui.invalidate('ui.render');
    }
}
async function refreshAccess($, state) {
    if (state.checkingAccess)
        return;
    state.checkingAccess = true;
    state.accessError = '';
    $.ui.invalidate('ui.render');
    try {
        applyAccess(state, await readAccess($, state.currentDirectory, state));
    }
    catch {
        state.accessError = 'Could not read the tools and permissions of this session.';
    }
    finally {
        state.checkingAccess = false;
        $.ui.invalidate('ui.render');
    }
}
async function refreshAgents($, state) {
    state.loadingAgents = true;
    state.agentError = '';
    $.ui.invalidate('ui.render');
    try {
        state.sessionAgents = await $.agent.list();
    }
    catch {
        state.sessionAgents = [];
        state.agentError = 'Could not load agents for this Claude Code session.';
    }
    finally {
        state.loadingAgents = false;
        $.ui.invalidate('ui.render');
    }
}
/** Everything the Overview shows, fetched together. */
async function refreshAll($, state) {
    await Promise.allSettled([
        refreshLoadout($, state, state.loadoutDetail).then(() => refreshPressureView($, state)),
        refreshAccess($, state),
        refreshAgents($, state),
    ]);
}
/** On open, fetch only what is missing; r refreshes everything. */
async function fillMissing($, state) {
    await Promise.allSettled([
        (state.loadout ? Promise.resolve() : refreshLoadout($, state, 'summary')).then(() => refreshPressureView($, state)),
        state.access ? undefined : refreshAccess($, state),
        refreshAgents($, state),
    ]);
}
/** Switches the pane to a view and loads what that view needs. */
function openTab($, state, tab) {
    state.activeTab = tab;
    $.ui.invalidate('ui.render');
    if (tab === 'context' && !state.loadout)
        void refreshLoadout($, state, 'summary');
    if (tab === 'access' && !state.access)
        void refreshAccess($, state);
    if (tab === 'agents') {
        state.agentSubview = 'active';
        void refreshAgents($, state);
    }
}
/**
 * One quick measurement in the background at startup: it saves this session's
 * loadout for the next comparison and warns when it grew or is over budget.
 */
async function startupCheck($, state) {
    state.measuring = true;
    try {
        const measured = await readLoadout($, 'summary', state.usageLog, state.currentDirectory, state.lazy);
        state.measuring = false;
        if (state.loadout)
            return;
        applyLoadout(state, measured, 'summary');
        const alert = startupAlert(measured.loadout, measured.since, state.alerts);
        if (alert)
            await $.ui.toast(alert);
        const spendAlert = await spendWarning($, state);
        if (spendAlert)
            await $.ui.toast(spendAlert);
    }
    catch {
        // The startup check is a convenience; /cognita measures again.
    }
    finally {
        state.measuring = false;
        $.ui.invalidate('ui.render');
    }
}
/** How full the window is, from Claude Code's own count. */
async function readWindow($) {
    const { context } = (await $.session.usage());
    if (context.percent === undefined && context.tokens === undefined) {
        // No model reply yet, so no count: measure what is loaded instead.
        const breakdown = (await $.session.usage({ breakdown: 'summary', columns: 80 })).context.breakdown;
        if (breakdown)
            return { windowPercent: breakdown.percentage, windowTokens: breakdown.totalTokens, windowMax: breakdown.maxTokens };
    }
    const percent = context.percent ?? (context.tokens !== undefined && context.window > 0 ? (context.tokens / context.window) * 100 : 0);
    return { windowPercent: percent, windowTokens: context.tokens, windowMax: context.window };
}
/**
 * What the person asked and the plan, from the transcript, plus whether an
 * Engram server can save. Best effort: an unreadable part reads as empty.
 */
async function readConversation($, state) {
    const [read, tools] = await Promise.all([
        $.session.messages().catch(() => []),
        $.tool.list().catch(() => []),
    ]);
    const messages = Array.isArray(read) ? read : [];
    if (!state.hasPlan) {
        // Loaded mid-session or resumed: rebuild the plan from the transcript's own calls.
        const seeded = planFromMessages(messages);
        if (seeded.hasPlanCalls) {
            state.plan = seeded.plan;
            state.hasPlan = true;
        }
    }
    const prompts = promptsOf(messages);
    state.tagged = mergeTagged(state.tagged, extractTagged(prompts));
    return { plan: state.plan, prompts, engramTool: engramSaveTool(tools.map((tool) => tool.name)) };
}
/** Reads the pressure and keeps it for the pane and the status line. */
async function refreshPressure($, state, window) {
    const [reading, conversation] = await Promise.all([window ?? readWindow($), readConversation($, state)]);
    const input = { ...reading, ...conversation };
    const pressure = pressureOf(input, state.pressureSettings);
    const recommendations = recommend(pressure, input);
    state.pressure = pressure;
    state.recommendations = recommendations;
    return { input, pressure, recommendations };
}
/** The pane's reading reuses the loadout's window count, so it asks Claude Code for nothing more. */
async function refreshPressureView($, state) {
    const loadout = state.loadout;
    if (!loadout)
        return;
    try {
        await refreshPressure($, state, { windowPercent: loadout.percentage, windowTokens: loadout.totalTokens, windowMax: loadout.maxTokens });
    }
    catch {
        // The card says it is not measured; /cognita pressure reports the failure.
    }
    finally {
        $.ui.invalidate('ui.render');
    }
}
/**
 * After each main-loop turn: measure the pressure and, when its level rises,
 * say so once with the one step to take, and propose that step as the prompt
 * box's suggestion.
 */
async function checkPressure($, state) {
    if (state.checkingPressure)
        return;
    state.checkingPressure = true;
    try {
        const { pressure, recommendations } = await refreshPressure($, state);
        const alert = state.pressureSettings.isAlertEnabled ? pressureAlert(state.pressureLevel, pressure, recommendations) : undefined;
        state.pressureLevel = pressure.level;
        if (alert) {
            await $.ui.toast(alert);
            const step = recommendations[0];
            if (step)
                await $.prompt.suggest({ text: step.command }).catch(() => undefined);
        }
    }
    catch {
        // The automatic check is a convenience; /cognita pressure measures again.
    }
    finally {
        state.checkingPressure = false;
        $.ui.invalidate('ui.render');
    }
}
/**
 * Compacting and submitting a prompt both wait for the turn a command hook
 * holds, so the commands answer at once and act on a dispatch of their own.
 */
const AFTER_COMMAND_MS = 100;
/** Compacts with the given focus and says how it went in a toast. */
async function compactNow($, state, focus) {
    if (state.compacting)
        return;
    state.compacting = true;
    $.ui.invalidate('ui.render');
    try {
        const result = await $.session.compact({ instructions: focus });
        if (result?.skip) {
            await $.ui.toast(`Compaction skipped: ${result.skip}`);
        }
        else {
            state.pressureLevel = 'ok';
            await $.ui.toast('Compacted, keeping the goal and the open plan.');
            await refreshPressure($, state).catch(() => undefined);
        }
    }
    catch {
        await $.ui.toast('Could not compact now (a turn may be running). Run the /compact line /cognita compact printed.');
    }
    finally {
        state.compacting = false;
        $.ui.invalidate('ui.render');
    }
}
/** Submits a prompt as the person's next turn, or says it could not. */
async function submitNow($, text) {
    try {
        await $.prompt.submit({ text });
    }
    catch {
        await $.ui.toast('Could not send the prompt. Paste the text /cognita printed as your next message.');
    }
}
/** Runs `fn` once the command hook has returned; false when the host has no timer. */
function afterCommand($, fn) {
    try {
        $.clock.after(AFTER_COMMAND_MS, () => void fn().catch(() => undefined));
        return true;
    }
    catch {
        return false;
    }
}
async function compactCommand($, state) {
    const focus = withTaggedInstructions(compactFocus(await readConversation($, state)), state.tagged) ?? '';
    const fallback = `\`\`\`\n/compact ${focus}\n\`\`\``;
    if (!afterCommand($, () => compactNow($, state, focus))) {
        return { text: `Run this to compact, keeping the goal and the plan:\n\n${fallback}`, isTextDisplayOnly: true };
    }
    return { text: `Compacting, keeping:\n\n> ${focus}\n\nIf it does not start, run:\n\n${fallback}`, isTextDisplayOnly: true };
}
function sendCommand($, prompt) {
    if (!afterCommand($, () => submitNow($, prompt))) {
        return { text: `Paste this as your next message:\n\n> ${prompt}`, isTextDisplayOnly: true };
    }
    return { text: `Sending this to Claude:\n\n> ${prompt}`, isTextDisplayOnly: true };
}
async function compactFromPane($, state) {
    try {
        const focus = compactFocus(await readConversation($, state));
        await compactNow($, state, withTaggedInstructions(focus, state.tagged) ?? focus);
    }
    catch {
        // compactNow reports its own failures; reading the conversation never throws.
    }
}
async function launchAgent($, state, project, value) {
    const task = value.trim();
    if (!task || state.launchingAgent)
        return;
    state.launchingAgent = true;
    $.ui.invalidate('ui.render');
    try {
        const result = await $.agent.spawn({
            prompt: task,
            description: task.length > 64 ? `${task.slice(0, 61)}…` : task,
            cwd: project.path || undefined,
        });
        if (result.deny) {
            await $.ui.toast(`Could not start agent: ${result.deny}`);
            return;
        }
        state.agentPrompt = '';
        state.agentSubview = 'active';
        await refreshAgents($, state);
        await $.ui.toast(`Agent started in ${project.name}.`);
    }
    catch {
        await $.ui.toast(`Could not start an agent in ${project.name}.`);
    }
    finally {
        state.launchingAgent = false;
        $.ui.invalidate('ui.render');
    }
}
async function runCommand($, state, event) {
    const [subcommand = '', option = '', ...rest] = (event.args ?? '').trim().toLowerCase().split(/\s+/);
    const options = new Set([option, ...rest]);
    const rawTail = (event.args ?? '').trim().split(/\s+/).slice(1).join(' ');
    if (subcommand === 'help')
        return { text: HELP };
    if (subcommand === 'doctor') {
        try {
            const version = await $.session.version().then((value) => value.version).catch(() => undefined);
            return { text: formatDoctor(state.compat ?? checkCompatibility(await probeEngine($)), version) };
        }
        catch {
            return { text: 'Could not run the compatibility check.' };
        }
    }
    if (subcommand === 'access' && !options.has('open')) {
        try {
            const report = applyAccess(state, await readAccess($, state.currentDirectory, state));
            if (options.has('json'))
                return { text: '```json\n' + formatAccessJson(report) + '\n```' };
            return { text: formatAccess(report) };
        }
        catch {
            return { text: 'Could not read the tools and permissions of this session.' };
        }
    }
    if (subcommand === 'supply') {
        try {
            const report = await readSupplyChain($, state.currentDirectory);
            if (options.has('json'))
                return { text: '```json\n' + formatSupplyChainJson(report) + '\n```' };
            return { text: formatSupplyChain(report) };
        }
        catch {
            return { text: 'Could not read the hooks and MCP servers of this session.' };
        }
    }
    if (subcommand === 'report') {
        try {
            const detail = options.has('full') ? 'full' : 'summary';
            const measured = applyLoadout(state, await readLoadout($, detail, state.usageLog, state.currentDirectory, state.lazy), detail);
            if (options.has('json'))
                return { text: '```json\n' + formatJson(measured, state.since, state.alerts) + '\n```' };
            const held = state.lazy.pendingNames();
            const heldLine = held.length > 0
                ? `\n\nHeld for this project: ${held.join(', ')} (not loaded this session) · \`/cognita connect <name>\``
                : '';
            const compatText = state.compat ? `\n\n${compatLine(state.compat)}` : '';
            return { text: formatReport(measured, promptCapture(state), state.usageLog, state.since, state.alerts.budget) + heldLine + compatText };
        }
        catch {
            return { text: 'Could not measure the context window for this session.' };
        }
    }
    if (subcommand === 'trim') {
        try {
            const measured = applyLoadout(state, await readLoadout($, 'summary', state.usageLog, state.currentDirectory, state.lazy), 'summary');
            return { text: formatTrimPlan(measured, state.alerts.budget) };
        }
        catch {
            return { text: 'Could not measure the context window for this session.' };
        }
    }
    if (subcommand === 'hold' || subcommand === 'connect' || subcommand === 'release') {
        try {
            return { text: await state.lazy[subcommand](lazyIo($), rawTail, state.loadout?.mcpServers) };
        }
        catch {
            return { text: `Could not run /cognita ${subcommand}.` };
        }
    }
    if (subcommand === 'cost') {
        try {
            const sessionId = await $.session.id();
            const cost = (await $.session.usage({})).cost;
            const current = cost?.usd;
            const isPartial = cost?.hasUnknownPrice === true;
            if (current !== undefined)
                await saveCost($, state, current, true, isPartial);
            const entries = costsOf(await $.store.get(costKey(state.currentDirectory)));
            const view = { now: new Date(), sessionId, current, budget: state.spendBudget, unavailable: current === undefined, isPartial };
            if (options.has('json'))
                return { text: '```json\n' + costJson(entries, view) + '\n```' };
            return { text: formatCost(entries, view) };
        }
        catch {
            return { text: 'Could not read the cost of this project.' };
        }
    }
    if (subcommand === 'history') {
        try {
            // Measuring first adds this session to the trend.
            applyLoadout(state, await readLoadout($, 'summary', state.usageLog, state.currentDirectory, state.lazy), 'summary');
            const trend = trendOf(await $.store.get(`history:${state.currentDirectory}`));
            const sessionId = await $.session.id();
            let entries = [];
            try {
                entries = costsOf(await $.store.get(costKey(state.currentDirectory)));
            }
            catch {
                // History still works without the cost column.
            }
            const costs = entries.length > 0 ? costBySession(entries) : undefined;
            return { text: formatHistory(trend, sessionId, state.alerts.budget, costs, costs ? spendLine(entries, new Date()) : undefined) };
        }
        catch {
            return { text: 'Could not read the loadout history for this project.' };
        }
    }
    if (subcommand === 'pressure') {
        try {
            const { pressure, recommendations } = await refreshPressure($, state);
            if (options.has('json'))
                return { text: '```json\n' + formatPressureJson(pressure, recommendations, state.pressureSettings) + '\n```' };
            const tagged = [...formatTagged(focusOf(state.tagged, pressure.windowTokens)), ...formatRetention(state.retention)];
            return { text: formatPressure(pressure, recommendations, state.pressureSettings, tagged) };
        }
        catch {
            return { text: 'Could not measure the context pressure for this session.' };
        }
    }
    if (subcommand === 'compact')
        return compactCommand($, state);
    if (subcommand === 'save') {
        const conversation = await readConversation($, state);
        if (!conversation.engramTool) {
            return { text: 'No Engram MCP server is connected in this session, so there is nowhere to save to. `/cognita compact` still keeps the goal and the plan in the summary.' };
        }
        const openItems = conversation.plan.filter((item) => item.status !== 'completed').length;
        return sendCommand($, engramPrompt(conversation.engramTool, openItems));
    }
    if (subcommand === 'split') {
        const { plan } = await readConversation($, state);
        if (plan.filter((item) => item.status === 'pending').length < 2) {
            return { text: 'The plan has fewer than two pending items, so there is nothing to split across subagents.' };
        }
        return sendCommand($, splitPrompt(plan));
    }
    if (subcommand === 'context' || subcommand === 'access' || subcommand === 'agents' || subcommand === 'overview') {
        state.activeTab = subcommand;
    }
    else if (subcommand) {
        return { text: `Unknown option "${subcommand}".\n\n${HELP}` };
    }
    else {
        state.activeTab = 'overview';
    }
    // Fill what the pane shows; each part redraws as it arrives.
    void fillMissing($, state);
    try {
        // Ask for room: the dock caps the width at its share, the inline block at what the layout spares.
        await $.ui.open({ id: PANE_ID, title: 'Cognita', focus: true, closeOnEscape: true, columns: 110, rows: 40 });
        return {};
    }
    catch {
        return { text: 'Could not open the Cognita pane. Try `/cognita report` or `/cognita access` instead.' };
    }
}
function renderPane($, state, event) {
    const ui = $.ui.resolve(event);
    const redraw = () => $.ui.invalidate('ui.render');
    const project = { name: basename(state.currentDirectory) || 'this project', path: state.currentDirectory };
    const select = (tab) => openTab($, state, tab);
    const lazyAction = (run) => async () => {
        try {
            await $.ui.toast(await run());
        }
        catch {
            await $.ui.toast('Could not change the held MCP servers.');
        }
        redraw();
    };
    const sidebar = renderSidebar(ui, {
        activeTab: state.activeTab,
        project: project.name,
        model: state.model,
        onTabSelect: select,
    });
    let content;
    if (state.activeTab === 'overview') {
        content = renderOverview(ui, {
            loadout: state.loadout,
            access: state.access,
            sessionAgents: state.sessionAgents,
            pressure: state.pressure,
            recommendations: state.recommendations,
            tagged: focusOf(state.tagged, state.pressure?.windowTokens),
            retention: state.retention,
            compacting: state.compacting,
            onCompact: () => void compactFromPane($, state),
            loading: state.measuring || state.checkingAccess,
            error: [state.contextError, state.accessError].filter(Boolean).join(' '),
            onRefresh: () => void refreshAll($, state),
            onOpen: select,
        });
    }
    else if (state.activeTab === 'context') {
        content = renderContext(ui, {
            loadout: state.loadout,
            since: state.since,
            prompt: promptCapture(state),
            subview: state.contextSubview,
            measuredAt: state.measuredAt,
            detail: state.loadoutDetail,
            loading: state.measuring,
            error: state.contextError,
            held: state.lazyView.held,
            unusedSessions: state.lazyView.unusedSessions,
            onHold: (server) => void lazyAction(() => state.lazy.hold(lazyIo($), server, state.loadout?.mcpServers))(),
            onConnect: (server) => void lazyAction(() => state.lazy.connect(lazyIo($), server ?? '', state.loadout?.mcpServers))(),
            onRefresh: (detail) => void refreshLoadout($, state, detail),
            onSubviewChange: (subview) => {
                state.contextSubview = subview;
                redraw();
            },
        });
    }
    else if (state.activeTab === 'access') {
        content = renderAccess(ui, {
            access: state.access,
            subview: state.accessSubview,
            loading: state.checkingAccess,
            error: state.accessError,
            checkedAt: state.accessCheckedAt,
            onRefresh: () => void refreshAccess($, state),
            onSubviewChange: (subview) => {
                state.accessSubview = subview;
                redraw();
            },
        });
    }
    else {
        content = renderAgents(ui, {
            agentSubview: state.agentSubview,
            agentSearch: state.agentSearch,
            agentPrompt: state.agentPrompt,
            sessionAgents: state.sessionAgents,
            selectedAgentId: state.selectedAgentId,
            selectedWorkspace: project,
            agentError: state.agentError,
            loadingAgents: state.loadingAgents,
            launchingAgent: state.launchingAgent,
            redraw,
            onSubviewChange: (subview) => {
                state.agentSubview = subview;
                if (subview === 'active' || subview === 'inactive')
                    state.agentSearch = '';
            },
            onAgentSearchInput: (value) => {
                state.agentSearch = value;
                redraw();
            },
            onAgentSearchSubmit: (value) => {
                state.agentSearch = value;
                redraw();
            },
            onRefreshAgents: () => refreshAgents($, state),
            onSelectAgent: (agentId) => {
                state.selectedAgentId = agentId;
                state.agentSubview = 'detail';
                redraw();
            },
            onAgentPromptInput: (value) => {
                state.agentPrompt = value;
            },
            onAgentPromptSubmit: (value) => launchAgent($, state, project, value),
        });
    }
    if (paneColumns(event) < COMPACT_BELOW) {
        return ui.Box({
            flexDirection: 'column',
            flexGrow: 1,
            rowGap: 1,
            children: [renderTabStrip(ui, { activeTab: state.activeTab, onTabSelect: select }), content],
        });
    }
    return ui.Box({
        flexDirection: 'row',
        flexGrow: 1,
        columnGap: 1,
        children: [sidebar, content],
    });
}
/** Checks the engine APIs once at load and says so when a feature is off. Never throws. */
async function checkEngineApis($, state) {
    try {
        state.compat = checkCompatibility(await probeEngine($));
        const notice = compatToast(state.compat);
        if (notice)
            await $.ui.toast(notice);
    }
    catch {
        // The check is a courtesy; the features degrade on their own.
    }
}
/** Below this many columns the sidebar gives way to a row of view buttons. */
const COMPACT_BELOW = 80;
/**
 * About how wide the pane is: docked beside a fullscreen transcript (from 110
 * columns) it gets at most 45% of the terminal; otherwise the full width.
 */
function paneColumns(event) {
    const viewport = event.viewport;
    if (!viewport || !viewport.columns || viewport.columns <= 0)
        return 120;
    return viewport.isFullscreen !== false && viewport.columns >= 110 ? Math.floor(viewport.columns * 0.45) : viewport.columns;
}
export function register(on) {
    const state = createState();
    on('session.start', async ($, event, next) => {
        for (const name of [COMMAND_NAME, LEGACY_COMMAND_NAME]) {
            await $.command.register({
                name,
                description: name === COMMAND_NAME
                    ? 'See what your agent has loaded and what it can do (try: /cognita access)'
                    : 'Alias of /cognita',
            });
        }
        state.currentDirectory = event.cwd ?? '';
        state.lazy.setCwd(state.currentDirectory);
        await checkEngineApis($, state);
        state.isStatusLineEnabled = (await $.env.get('CLAUDE_INSPECTOR_STATUSLINE'))?.trim() !== '0';
        const loaded = await readPolicy($);
        state.policy = loaded.policy;
        state.policyWarnings = loaded.warnings;
        state.alerts = mergeAlerts(state.policy, await readAlertSettings($));
        state.spendBudget = parseSpendBudget(await $.env.get('CLAUDE_INSPECTOR_SPEND_BUDGET'));
        state.pressureSettings = parsePressureSettings({
            watch: await $.env.get('CLAUDE_INSPECTOR_PRESSURE_WATCH'),
            act: await $.env.get('CLAUDE_INSPECTOR_PRESSURE_ACT'),
            alert: await $.env.get('CLAUDE_INSPECTOR_PRESSURE_ALERT'),
        });
        const isStartupCheckEnabled = (await $.env.get('CLAUDE_INSPECTOR_STARTUP_CHECK'))?.trim() !== '0';
        const result = await next?.(event);
        if (isStartupCheckEnabled && event.isInteractive !== false && !state.loadout && !state.measuring) {
            void startupCheck($, state);
        }
        return result;
    });
    // Holds back the engine's start-up raise of every MCP server this project holds.
    on('mcp.connect', ($, event, next) => state.lazy.onConnect(lazyIo($), event, next));
    on('command.run', { command: COMMAND_NAME }, ($, event) => runCommand($, state, event));
    on('command.run', { command: LEGACY_COMMAND_NAME }, ($, event) => runCommand($, state, event));
    // Observe-only hooks: they record what the session uses and always pass
    // the event on unchanged, so a failure here never changes what Claude does.
    on('tool.call', ($, event, next) => {
        try {
            if (typeof event.tool === 'string') {
                recordToolCall(state.usageLog, event.tool);
                const server = mcpServerOf(event.tool);
                if (server)
                    state.lazy.noteUsed(lazyIo($), server);
            }
        }
        catch {
            // Recording is best effort.
        }
        if (!isPlanTool(event.tool))
            return next?.(event);
        return trackPlan(state, event, next);
    });
    // Every compaction, the person's or the engine's, is asked to keep the
    // tagged items by id; afterwards the summary is checked for each one.
    on('session.compact', (_$, event, next) => keepTagged(_$, state, event, next));
    // After each main-loop turn, check the pressure and warn when it rises.
    on('turn.complete', async ($, event, next) => {
        const result = await next?.(event);
        const isWatching = state.pressureSettings.isAlertEnabled || state.isStatusLineEnabled;
        if (isWatching && event.agentId === undefined && event.isAborted !== true)
            void checkPressure($, state);
        return result;
    });
    on('skill.prompt', ($, event, next) => {
        try {
            if (typeof event.skill === 'string')
                recordSkillUse(state.usageLog, event.skill);
        }
        catch {
            // Recording is best effort.
        }
        return next?.(event);
    });
    on('prompt.compose', async ($, event, next) => {
        const result = await next?.(event);
        if (Array.isArray(result?.sections))
            state.promptSections = result.sections;
        return result;
    });
    on('prompt.context', async ($, event, next) => {
        const result = await next?.(event);
        if (Array.isArray(result?.blocks))
            state.promptBlocks = result.blocks;
        const files = result?.instructionFiles ?? event.instructionFiles;
        if (Array.isArray(files))
            state.instructionFiles = files;
        return result;
    });
    on('session.measure', ($, event, next) => {
        const cost = event.cost;
        // Recorded whatever the status line says: the budget and history need it.
        if (cost && typeof cost.usd === 'number')
            void saveCost($, state, cost.usd, false, cost.hasUnknownPrice === true);
        if (state.isStatusLineEnabled) {
            try {
                const context = event.context;
                const percent = context?.percent;
                const held = state.lazy.pendingNames().length;
                $.ui.status(percent === undefined
                    ? undefined
                    : [`ctx ${Math.round(percent)}%`, cost ? `$${cost.usd.toFixed(2)}${cost.hasUnknownPrice ? '+' : ''}` : '', sinceBadge(state.since), pressureBadge(state.pressure), held > 0 ? `${held} MCP held` : ''].filter(Boolean).join(' · '));
            }
            catch {
                // The status line is cosmetic.
            }
        }
        return next?.(event);
    });
    on('ui.render', { component: 'Pane' }, async ($, event, next) => {
        if (event.requestId !== PANE_ID)
            return next?.(event);
        state.lazyView = await state.lazy.view(lazyIo($)).catch(() => ({ held: [], unusedSessions: {} }));
        return renderPane($, state, event);
    });
}
/** The slice of `$` that lazy MCP uses, with `$` spelled at each call site. */
function lazyIo($) {
    return {
        cwd: () => $.session.cwd(),
        get: (key) => $.store.get(key),
        set: (key, value) => $.store.set(key, value),
        connect: (server) => $.mcp.connect(server),
    };
}
/**
 * Lets a plan call run, then applies it to the tracked plan, which outlives a
 * compaction (the transcript's copy of the call does not). Observe only: the
 * result passes on unchanged.
 */
async function trackPlan(state, event, next) {
    const result = await next?.(event);
    try {
        const outcome = result;
        if (!outcome?.deny && !outcome?.isError) {
            state.plan = applyPlanCall(state.plan, {
                tool: String(event.tool),
                input: event,
                resultText: typeof outcome?.text === 'string' ? outcome.text : undefined,
                agentId: typeof event.agentId === 'string' ? event.agentId : undefined,
            });
            state.hasPlan = true;
        }
    }
    catch {
        // Tracking is best effort.
    }
    return result;
}
async function keepTagged($, state, event, next) {
    let items = [];
    let forwarded = event;
    try {
        if (event.agentId === undefined) {
            const messages = Array.isArray(event.messages) ? event.messages : [];
            items = state.tagged = mergeTagged(state.tagged, extractTagged(promptsOf(messages)));
            const instructions = withTaggedInstructions(typeof event.instructions === 'string' ? event.instructions : undefined, items);
            if (instructions !== event.instructions)
                forwarded = { ...event, instructions };
        }
    }
    catch {
        items = [];
        forwarded = event;
    }
    const result = await next?.(forwarded);
    try {
        const kept = result?.messages;
        if (items.length > 0 && Array.isArray(kept) && event.trigger !== 'precompute') {
            state.retention = retentionOf(items, kept.map((message) => message.text ?? '').join('\n'));
            const alert = retentionAlert(state.retention);
            if (alert)
                void $.ui.toast(alert);
            $.ui.invalidate('ui.render');
        }
    }
    catch {
        // The retention check is best effort; the compaction already happened.
    }
    return result;
}
/** Measures the context window and joins it with what the session has used. */
async function readLoadout($, detail, usageLog, cwd, lazy) {
    const usage = await $.session.usage({ breakdown: detail, columns: 80 });
    const breakdown = usage.context.breakdown;
    if (!breakdown)
        throw new Error('Claude Code returned no context breakdown.');
    const loadout = summarize(breakdown, usageLog);
    return { loadout, since: await compareWithLastSession($, cwd, loadout, lazy) };
}
/**
 * Reads what the agent can reach: its tools, what the permission system answers
 * for a set of sample actions (asked, never run), settings, plugins and commands.
 * Every part is best effort, so one failing API leaves the rest of the report.
 */
async function readAccess($, cwd, state) {
    const tools = await $.tool.list();
    const names = new Set(tools.map((tool) => tool.name));
    const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || '~';
    const paths = { cwd: cwd || '.', home };
    const probes = await Promise.all([...PROBES, ...customProbes(state.policy)].map(async (probe) => {
        const base = { key: probe.key, label: probe.label, tool: probe.tool, isRisky: probe.isRisky };
        if (!names.has(probe.tool))
            return { ...base, verdict: 'missing' };
        try {
            const result = await $.tool.check({ tool: probe.tool, input: probe.input(paths) });
            return { ...base, verdict: result.decision, reason: result.reason, rule: result.rule };
        }
        catch {
            return { ...base, verdict: 'unknown' };
        }
    }));
    const mcpNames = tools.filter((tool) => tool.mcp).map((tool) => tool.name);
    const mcpProbes = await probeMcpTools($, mcpNames);
    const mcpSkipped = Math.max(0, mcpNames.length - MCP_PROBE_LIMIT);
    const settings = {};
    await Promise.all(SETTINGS_SOURCES.map(async (source) => {
        try {
            settings[source] = await $.settings.read({ source });
        }
        catch {
            // A source that is absent or unreadable adds nothing.
        }
    }));
    const [commands, model, version] = await Promise.all([
        $.command.list().catch(() => []),
        $.session.model().catch(() => undefined),
        $.session.version().then((value) => value.version).catch(() => undefined),
    ]);
    return analyzeAccess({ model, version, tools, probes, settings, commands, mcpProbes, mcpSkipped, policy: state.policy, policyWarnings: state.policyWarnings });
}
const MCP_PROBE_BATCH = 8;
/**
 * Asks the permission system about every loaded MCP tool with an empty input.
 * Nothing runs. Bounded in number and concurrency; a failed check is `unknown`.
 */
async function probeMcpTools($, names) {
    const results = [];
    const wanted = names.slice(0, MCP_PROBE_LIMIT);
    for (let start = 0; start < wanted.length; start += MCP_PROBE_BATCH) {
        const batch = wanted.slice(start, start + MCP_PROBE_BATCH);
        results.push(...await Promise.all(batch.map(async (name) => {
            try {
                return { name, verdict: (await $.tool.check({ tool: name, input: {} })).decision };
            }
            catch {
                return { name, verdict: 'unknown' };
            }
        })));
    }
    return results;
}
/** Reads and validates .cognita.json from the project root. A missing file is no policy; a bad one is a warning. */
async function readPolicy($) {
    try {
        const text = await $.fs.read(POLICY_FILE);
        return parsePolicy(text);
    }
    catch (error) {
        // No file is the usual case and means no policy; a file that is there but
        // unreadable, or a folder that cannot be listed, becomes a visible warning.
        let fileListed;
        try {
            fileListed = (await $.fs.list('.')).some((entry) => entry.name === POLICY_FILE);
        }
        catch {
            fileListed = undefined;
        }
        return { policy: { require: {}, actions: [] }, warnings: policyReadFailure(error, fileListed) };
    }
}
/**
 * Reads the hooks, MCP servers and plugins that run code on this machine.
 * The mod API exposes settings and the tool list but not plugin-contributed
 * hooks or MCP configs, so what it cannot read is named in the report.
 * Best effort: every part can fail without losing the rest.
 */
async function readSupplyChain($, cwd) {
    const settings = {};
    const unreadable = [];
    await Promise.all(SETTINGS_SOURCES.map(async (source) => {
        try {
            settings[source] = await $.settings.read({ source });
        }
        catch {
            // A source that is absent or unreadable adds nothing.
        }
    }));
    let toolServers = [];
    try {
        const servers = new Set();
        for (const tool of await $.tool.list()) {
            const server = tool.mcp ? /^mcp__(.+?)__/.exec(tool.name)?.[1] : undefined;
            if (server)
                servers.add(server);
        }
        toolServers = [...servers];
    }
    catch {
        unreadable.push('The tool list, so MCP servers not in your settings are missing.');
    }
    const mcpFiles = [];
    try {
        const entries = await $.fs.list(cwd || '.');
        if (entries.some((entry) => entry.name === '.mcp.json')) {
            // The plugin API can list files but not read them, so its servers stay unknown.
            unreadable.push('`.mcp.json` exists in this project but the plugin API cannot read files; its servers show only if connected.');
        }
    }
    catch {
        unreadable.push('`.mcp.json` of this project.');
    }
    unreadable.push('Hooks and MCP servers that plugins bring: the plugin API does not expose them. Servers show above as "config not readable".');
    return analyzeSupplyChain({ settings, mcpFiles, toolServers, unreadable });
}
/** Budget and growth warnings from CLAUDE_INSPECTOR_BUDGET and CLAUDE_INSPECTOR_ALERT. */
async function readAlertSettings($) {
    const budget = parseTokens(await $.env.get('CLAUDE_INSPECTOR_BUDGET'));
    const growth = parseTokens(await $.env.get('CLAUDE_INSPECTOR_ALERT'));
    return { budget: budget || undefined, growth: growth ?? DEFAULT_GROWTH_ALERT };
}
/**
 * Saves this measurement for the project and compares it with the last one
 * another session saved. Best effort: a store failure only loses the comparison.
 */
async function compareWithLastSession($, cwd, loadout, lazy) {
    if (!cwd)
        return undefined;
    try {
        const key = `history:${cwd}`;
        const sessionId = await $.session.id();
        void lazy.noteLoaded(lazyIo($), sessionId, loadout.mcpServers.map((server) => server.server));
        const snapshot = toSnapshot(loadout, sessionId);
        const { history, baseline } = rememberSnapshot(await $.store.get(key), snapshot);
        await $.store.set(key, history);
        return baseline ? diffLoadout(baseline, snapshot) : 'first';
    }
    catch {
        return undefined;
    }
}
const costKey = (cwd) => `cost:${cwd}`;
function parseSpendBudget(value) {
    const number = Number((value ?? '').trim().replace(/^\$/, ''));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}
/**
 * Saves what this session has cost into the project's store. Throttled: it
 * writes only when the cost grew by a cent. Best effort, never throws.
 */
function saveCost($, state, usd, force = false, isPartial = false) {
    state.sessionCost = usd;
    // A newly unpriced model is saved at once, even when the amount barely moved.
    const isNewlyPartial = isPartial && !state.costSavedPartial;
    if (!state.currentDirectory || (!force && !isNewlyPartial && state.costSaved >= 0 && usd < state.costSaved + 0.01))
        return state.costWrite;
    state.costSaved = usd;
    state.costSavedPartial = state.costSavedPartial || isPartial;
    state.costWrite = state.costWrite.then(async () => {
        try {
            const key = costKey(state.currentDirectory);
            const { list, changed } = recordCost(await $.store.get(key), await $.session.id(), usd, dayKey(new Date()), undefined, isPartial);
            if (changed)
                await $.store.set(key, list);
        }
        catch {
            // Cost tracking is a convenience; a store failure only loses a number.
        }
    });
    return state.costWrite;
}
/** A startup warning when this month's spend is over CLAUDE_INSPECTOR_SPEND_BUDGET. */
async function spendWarning($, state) {
    if (!state.spendBudget || !state.currentDirectory)
        return undefined;
    try {
        const entries = costsOf(await $.store.get(costKey(state.currentDirectory)));
        return budgetWarning(budgetStatus(entries, state.spendBudget, new Date()));
    }
    catch {
        return undefined;
    }
}
