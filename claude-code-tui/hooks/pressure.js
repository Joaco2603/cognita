// Context pressure: how full the window is (measured) plus how much the
// conversation asks the model to keep in mind at once (estimated), and the one
// step that relieves it. Pure functions; register.ts feeds them session data.
import { meter } from './loadout.js';
/**
 * The desktop plan tool: `items` replaces the list; `done` (1-based) checks
 * items off; `advance` completes the item in progress and starts the next
 * pending one; `start` (1-based) starts one.
 */
function applyDesktopPlan(plan, input) {
    let next = Array.isArray(input.items)
        ? input.items.map((item, index) => ({ id: String(index + 1), text: asText(item?.content), detail: '', status: statusOf(item?.status) }))
        : [...plan];
    const done = Array.isArray(input.done) ? input.done.map(Number) : [];
    next = next.map((item, index) => (done.includes(index + 1) ? { ...item, status: 'completed' } : item));
    if (input.advance === true) {
        const current = next.findIndex((item) => item.status === 'in_progress');
        if (current >= 0)
            next[current] = { ...next[current], status: 'completed' };
        const following = next.findIndex((item, index) => index > current && item.status === 'pending');
        if (following >= 0)
            next[following] = { ...next[following], status: 'in_progress' };
    }
    const start = Number(input.start);
    if (Number.isInteger(start) && next[start - 1]) {
        // One item is in progress at a time: the one that was goes back to pending.
        next = next.map((item, index) => index === start - 1
            ? { ...item, status: 'in_progress' }
            : item.status === 'in_progress' ? { ...item, status: 'pending' } : item);
    }
    return next;
}
export const DEFAULT_PRESSURE = { watch: 50, act: 70, isAlertEnabled: true };
// Attention weights. Estimates of what splits the model's focus, not measurements.
export const POINTS_PER_OPEN_ITEM = 4;
export const PLAN_WORDS_PER_POINT = 20;
export const PROMPT_WORDS_PER_POINT = 40;
export const FREE_PROMPTS = 5;
export const RECENT_PROMPTS = 3;
export const ATTENTION_CAPS = { planItems: 40, planWords: 20, promptWords: 20, turns: 20 };
/** How much attention can add on top of the window, at most. */
export const ATTENTION_WEIGHT = 0.5;
/** From this many open items a plan is worth splitting across subagents. */
export const SPLIT_FROM_ITEMS = 5;
/** From this much window use compacting frees real room. */
export const COMPACT_FROM_WINDOW = 30;
/** From this many prompts since the last compaction, old turns are worth summarizing. */
export const COMPACT_FROM_PROMPTS = 15;
/** The Claude desktop app's own plan tool, which replaces TodoWrite there. */
export const DESKTOP_PLAN_TOOL = 'mcp__ccd_turn__update_plan';
const PLAN_TOOLS = new Set(['TodoWrite', 'TaskCreate', 'TaskUpdate', DESKTOP_PLAN_TOOL]);
/** Whether a tool call can change the plan. */
export function isPlanTool(tool) {
    return typeof tool === 'string' && PLAN_TOOLS.has(tool);
}
const LEVEL_RANK = { ok: 0, watch: 1, act: 2 };
export function wordCount(text) {
    return text.split(/\s+/).filter(Boolean).length;
}
function statusOf(value) {
    return value === 'in_progress' || value === 'completed' ? value : 'pending';
}
const asText = (value) => (typeof value === 'string' ? value : '');
/**
 * The plan after one tool call. TodoWrite replaces the list (a subagent's own
 * list is its business); TaskCreate and TaskUpdate edit the shared task list.
 * Any other call returns the plan unchanged, the same array.
 */
export function applyPlanCall(plan, call) {
    const input = call.input ?? {};
    if (call.tool === 'TodoWrite') {
        if (call.agentId || !Array.isArray(input.todos))
            return plan;
        return input.todos.map((todo, index) => ({
            id: String(index + 1),
            text: asText(todo?.content),
            detail: '',
            status: statusOf(todo?.status),
        }));
    }
    if (call.tool === DESKTOP_PLAN_TOOL)
        return call.agentId ? plan : applyDesktopPlan(plan, input);
    if (call.tool === 'TaskCreate') {
        const fromResult = call.resultText?.match(/#(\d+)/)?.[1];
        const highest = plan.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
        const id = fromResult ?? String(Math.max(highest, plan.length) + 1);
        return [...plan.filter((item) => item.id !== id), { id, text: asText(input.subject), detail: asText(input.description), status: 'pending' }];
    }
    if (call.tool === 'TaskUpdate') {
        const id = String(input.taskId ?? '');
        if (!plan.some((item) => item.id === id))
            return plan;
        if (input.status === 'deleted')
            return plan.filter((item) => item.id !== id);
        return plan.map((item) => item.id !== id ? item : {
            ...item,
            text: typeof input.subject === 'string' ? input.subject : item.text,
            detail: typeof input.description === 'string' ? input.description : item.detail,
            status: input.status === undefined ? item.status : statusOf(input.status),
        });
    }
    return plan;
}
/** The plan the transcript's own plan calls build, for a mod loaded mid-session. */
export function planFromMessages(messages) {
    let plan = [];
    let hasPlanCalls = false;
    for (const message of messages) {
        for (const use of message.toolUses ?? []) {
            if (!PLAN_TOOLS.has(use.tool))
                continue;
            hasPlanCalls = true;
            plan = applyPlanCall(plan, { tool: use.tool, input: use.input ?? {}, resultText: use.text });
        }
    }
    return { plan, hasPlanCalls };
}
// Only the tags the engine wraps around its own markup. Any other tag is the person's text and stays.
const ENGINE_BLOCK = /<(system-reminder|command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
const COMPACTION_SUMMARY = /^This session is being continued from a previous conversation/;
/**
 * What the person typed, oldest first: user messages with their own text, less
 * reminders and command markup the engine wraps in tags, less the summary a
 * compaction leaves.
 */
export function promptsOf(messages) {
    return messages
        .filter((message) => message.role === 'user' && message.text)
        .map((message) => message.text.replace(ENGINE_BLOCK, '').trim())
        .filter((text) => text && !COMPACTION_SUMMARY.test(text));
}
function shorten(text, max) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}
/** The current goal: the latest prompt with a few words in it ("yes, go" is not a goal). */
export function goalOf(prompts) {
    // Tagged items go to the summary by id; the goal is the rest of the prompt.
    const untagged = prompts.map((prompt) => prompt.replace(/<(important|decision|open|constraint)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' '));
    const goal = [...untagged].reverse().find((prompt) => wordCount(prompt) >= 4);
    return goal ? shorten(goal, 160).replaceAll('"', "'") : '';
}
const isOpen = (item) => item.status !== 'completed';
/** The estimated attention load, 0 to 100: capped points per signal, summed. */
export function attentionOf(input) {
    const open = input.plan.filter(isOpen);
    const planWords = open.reduce((total, item) => total + wordCount(item.text) + wordCount(item.detail), 0);
    const recentWords = input.prompts.slice(-RECENT_PROMPTS).reduce((total, prompt) => total + wordCount(prompt), 0);
    const promptCount = input.prompts.length;
    const parts = {
        planItems: Math.min(ATTENTION_CAPS.planItems, open.length * POINTS_PER_OPEN_ITEM),
        planWords: Math.min(ATTENTION_CAPS.planWords, planWords / PLAN_WORDS_PER_POINT),
        promptWords: Math.min(ATTENTION_CAPS.promptWords, recentWords / PROMPT_WORDS_PER_POINT),
        turns: Math.min(ATTENTION_CAPS.turns, Math.max(0, promptCount - FREE_PROMPTS)),
    };
    const total = Math.min(100, parts.planItems + parts.planWords + parts.promptWords + parts.turns);
    return { total, parts, openItems: open.length, planWords, recentWords, promptCount };
}
export function levelOf(percent, settings) {
    return percent >= settings.act ? 'act' : percent >= settings.watch ? 'watch' : 'ok';
}
/**
 * pressure = window + ATTENTION_WEIGHT × attention × (1 − window): attention
 * fills part of the room the window leaves, so a full window is 100% on its
 * own and attention alone tops out at half.
 */
export function pressureOf(input, settings) {
    const window = Math.max(0, Math.min(100, Number.isFinite(input.windowPercent) ? input.windowPercent : 0));
    const attention = attentionOf(input);
    const percent = Math.round(Math.min(100, window + ATTENTION_WEIGHT * attention.total * (100 - window) / 100));
    return {
        ...attention,
        percent,
        level: levelOf(percent, settings),
        window,
        windowTokens: input.windowTokens,
        windowMax: input.windowMax,
        attention: attention.total,
    };
}
/** Reads `CLAUDE_INSPECTOR_PRESSURE_*` values; thresholds that make no sense fall back to the defaults. */
export function parsePressureSettings(env) {
    const read = (value) => {
        const match = value?.trim().match(/^(\d{1,3})%?$/);
        return match ? Number(match[1]) : undefined;
    };
    const watch = read(env.watch) ?? DEFAULT_PRESSURE.watch;
    const act = read(env.act) ?? DEFAULT_PRESSURE.act;
    const isValid = watch >= 1 && watch < act && act <= 100;
    return {
        watch: isValid ? watch : DEFAULT_PRESSURE.watch,
        act: isValid ? act : DEFAULT_PRESSURE.act,
        isAlertEnabled: env.alert?.trim() !== '0',
    };
}
/** The save tool of a connected Engram server: `mcp__engram__mem_save` or a plugin's. */
export function engramSaveTool(toolNames) {
    return toolNames.find((name) => /^mcp__.*engram.*__mem_save$/i.test(name));
}
const FOCUS_ITEMS = 5;
const SPLIT_ITEMS = 5;
/** What `/compact` should keep and drop, built from the goal and the open plan. */
export function compactFocus(input) {
    const keep = [];
    const goal = goalOf(input.prompts);
    if (goal)
        keep.push(`the goal "${goal}"`);
    const active = input.plan.filter((item) => item.status === 'in_progress');
    if (active.length > 0)
        keep.push(`in progress: ${active.map((item) => shorten(item.text, 60)).join(', ')}`);
    const pending = input.plan.filter((item) => item.status === 'pending');
    if (pending.length > 0) {
        const more = pending.length > FOCUS_ITEMS ? ` (+${pending.length - FOCUS_ITEMS} more)` : '';
        keep.push(`open plan: ${pending.slice(0, FOCUS_ITEMS).map((item) => shorten(item.text, 60)).join(', ')}${more}`);
    }
    keep.push('decisions made and why, and the files being changed');
    return `Keep: ${keep.join('; ')}. Drop: finished exploration, long tool output, errors already fixed.`;
}
function plural(count, noun) {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
/** The prompt that hands the pending plan items to subagents. */
export function splitPrompt(plan) {
    const pending = plan.filter((item) => item.status === 'pending').slice(0, SPLIT_ITEMS);
    return `Delegate these plan items to subagents, one subagent each, if they do not depend on each other: ${pending.map((item, index) => `${index + 1}) ${shorten(item.text, 80)}`).join('; ')}. Keep only each subagent's short report in this conversation, and do the items that depend on others here, in order.`;
}
/** The prompt that saves what a compaction would blur to Engram. */
export function engramPrompt(tool, openItems) {
    return `Before this conversation is compacted, use ${tool} to save to Engram: the goal, the decisions made so far and why, the open plan (${plural(openItems, 'item')}), and the key findings with their file paths. One observation per topic.`;
}
/**
 * The steps worth taking, in order, or none while pressure is ok.
 * - split: the plan has SPLIT_FROM_ITEMS or more open items.
 * - compact: the window is COMPACT_FROM_WINDOW% or more, there are
 *   COMPACT_FROM_PROMPTS or more prompts, or splitting is not on the table.
 * - engram: a step above loses detail and an Engram server is connected; it goes first.
 * When attention adds more than the window, splitting leads.
 */
export function recommend(pressure, input) {
    if (pressure.level === 'ok')
        return [];
    const pending = input.plan.filter((item) => item.status === 'pending');
    const split = pressure.openItems >= SPLIT_FROM_ITEMS && pending.length >= 2
        ? {
            kind: 'split',
            title: 'Split the plan across subagents',
            why: `${plural(pressure.openItems, 'open plan item')} compete for the model's attention; each subagent gets one with a clean context and reports back a summary.`,
            command: '/cognita split',
            text: splitPrompt(input.plan),
        }
        : undefined;
    const compact = pressure.window >= COMPACT_FROM_WINDOW || pressure.promptCount >= COMPACT_FROM_PROMPTS || !split
        ? {
            kind: 'compact',
            title: 'Compact, keeping the goal and the plan',
            why: `The window is ${Math.round(pressure.window)}% full after ${plural(pressure.promptCount, 'prompt')}; a focused summary keeps what matters and drops old tool output.`,
            command: '/cognita compact',
            text: compactFocus(input),
        }
        : undefined;
    const engram = input.engramTool && (split || compact)
        ? {
            kind: 'engram',
            title: 'Save decisions to Engram first',
            why: 'Compacting and delegating lose detail; Engram keeps it across compactions and sessions.',
            command: '/cognita save',
            text: engramPrompt(input.engramTool, pressure.openItems),
        }
        : undefined;
    const attentionLed = pressure.percent - pressure.window > pressure.window;
    return [
        attentionLed ? split : undefined,
        engram,
        compact,
        attentionLed ? undefined : split,
    ].filter((step) => step !== undefined);
}
/** The biggest attention signal, in words, for a one-line summary. */
function mainDriver(pressure) {
    const [name, points] = Object.entries(pressure.parts)
        .sort((a, b) => b[1] - a[1])[0];
    if (points <= 0)
        return undefined;
    if (name === 'planItems')
        return plural(pressure.openItems, 'open plan item');
    if (name === 'planWords')
        return `${plural(pressure.planWords, 'word')} in the open plan`;
    if (name === 'promptWords')
        return `${plural(pressure.recentWords, 'word')} in your last prompts`;
    return `${plural(pressure.promptCount, 'prompt')} since the last compaction`;
}
function nextStep(recommendations, pressure) {
    const [first, second] = recommendations;
    if (!first)
        return 'Run /cognita pressure for details.';
    if (first.kind === 'compact')
        return 'Run /cognita compact to compact and keep the goal and plan.';
    if (first.kind === 'split')
        return `Run /cognita split to hand ${plural(Math.min(pressure.openItems, SPLIT_ITEMS), 'plan item')} to subagents.`;
    return `Run /cognita save to keep decisions in Engram${second ? `, then ${second.command}` : ''}.`;
}
/** The toast a rising level raises, or undefined: nothing rose, or pressure is ok. */
export function pressureAlert(previous, pressure, recommendations) {
    if (pressure.level === 'ok' || LEVEL_RANK[pressure.level] <= LEVEL_RANK[previous])
        return undefined;
    const drivers = [`window ${Math.round(pressure.window)}%`, mainDriver(pressure)].filter(Boolean).join(', ');
    return `Context pressure ${pressure.percent}% (${pressure.level}): ${drivers}. ${nextStep(recommendations, pressure)}`;
}
/** Status-line suffix while pressure is not ok: `pressure 72% act`. */
export function pressureBadge(pressure) {
    return pressure && pressure.level !== 'ok' ? `pressure ${pressure.percent}% ${pressure.level}` : '';
}
const tokens = (count) => Math.round(count).toLocaleString('en-US');
const points = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
/** Markdown for `/cognita pressure`. */
export function formatPressure(pressure, recommendations, settings, extra = []) {
    const windowDetail = pressure.windowTokens !== undefined && pressure.windowMax
        ? ` (${tokens(pressure.windowTokens)} of ${tokens(pressure.windowMax)} tokens)`
        : '';
    const lines = [
        `## Context pressure: ${pressure.percent}% · ${pressure.level}`,
        '',
        `\`${meter(pressure.percent, 20)}\` window ${Math.round(pressure.window)}%${windowDetail} + attention ${Math.round(pressure.attention)} / 100 (estimate)`,
        '',
        '| Attention signal | Value | Points |',
        '| --- | --- | --- |',
        `| Open plan items | ${pressure.openItems} | ${points(pressure.parts.planItems)} / ${ATTENTION_CAPS.planItems} |`,
        `| Words in the open plan | ${pressure.planWords} | ${points(pressure.parts.planWords)} / ${ATTENTION_CAPS.planWords} |`,
        `| Words in your last ${RECENT_PROMPTS} prompts | ${pressure.recentWords} | ${points(pressure.parts.promptWords)} / ${ATTENTION_CAPS.promptWords} |`,
        `| Prompts since the last compaction | ${pressure.promptCount} | ${points(pressure.parts.turns)} / ${ATTENTION_CAPS.turns} |`,
        '',
        `Pressure = window + ½ × attention × (1 − window). Levels: ok below ${settings.watch}%, watch from ${settings.watch}%, act from ${settings.act}%.`,
        '',
        '### What to do',
        '',
    ];
    if (recommendations.length === 0) {
        lines.push(`Nothing to do yet. Cognita warns you on its own when pressure reaches ${settings.watch}%.`);
    }
    recommendations.forEach((step, index) => {
        lines.push(`${index + 1}. **${step.title}.** ${step.why}`);
        if (step.kind === 'compact') {
            lines.push(`   Run \`${step.command}\`, which does the same as:`, '   ```', `   /compact ${step.text}`, '   ```', '');
        }
        else {
            lines.push(`   Run \`${step.command}\`, which sends:`, `   > ${step.text}`, '');
        }
    });
    if (extra.length > 0)
        lines.push('', ...extra);
    lines.push('', '_The window is measured by Claude Code. Attention is an estimate from the plan, your prompts and the turn count, not a measurement of the model._');
    return lines.join('\n');
}
/** Machine-readable pressure for scripts: `/cognita pressure json`. */
export function formatPressureJson(pressure, recommendations, settings) {
    return JSON.stringify({
        shape: 'cognita-pressure-1',
        percent: pressure.percent,
        level: pressure.level,
        thresholds: { watch: settings.watch, act: settings.act },
        window: { percent: pressure.window, tokens: pressure.windowTokens ?? null, max: pressure.windowMax ?? null },
        attention: {
            total: pressure.attention,
            isEstimate: true,
            parts: pressure.parts,
            openItems: pressure.openItems,
            planWords: pressure.planWords,
            recentWords: pressure.recentWords,
            promptCount: pressure.promptCount,
        },
        recommendations,
    }, null, 2);
}
