// Real session cost in USD, kept per project. Pure logic: the store IO lives in register.ts.
import { sparkline } from '../../core/loadout.js';
/** The most sessions kept per project. */
export const COST_LIMIT = 200;
export const DAYS_SHOWN = 14;
export const SESSIONS_SHOWN = 20;
export const COST_UNAVAILABLE = 'Cost not reported by this Claude Code version.';
const isEntry = (value) => {
    const entry = value;
    return (typeof entry === 'object' &&
        entry !== null &&
        typeof entry.sessionId === 'string' &&
        typeof entry.day === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(entry.day) &&
        typeof entry.usd === 'number' &&
        Number.isFinite(entry.usd) &&
        entry.usd >= 0);
};
/** The stored list, or an empty one when it is missing or malformed. */
export function costsOf(stored) {
    return Array.isArray(stored) ? stored.filter(isEntry) : [];
}
/** The local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
/**
 * Remembers this session's cost, keeping the highest value seen (cost only
 * grows) and the most recent COST_LIMIT sessions. `changed` is false when
 * nothing needs saving. `isPartial` marks a cost that left out a model
 * without a known price; once marked, the session stays a lower bound.
 */
export function recordCost(stored, sessionId, usd, day, limit = COST_LIMIT, isPartial = false) {
    const list = costsOf(stored);
    if (!sessionId || !Number.isFinite(usd) || usd < 0)
        return { list, changed: false };
    const index = list.findIndex((entry) => entry.sessionId === sessionId);
    if (index >= 0) {
        const old = list[index];
        const partial = isPartial || old.partial === true;
        if (usd <= old.usd && partial === (old.partial === true))
            return { list, changed: false };
        const next = list.slice();
        next[index] = { sessionId, day: old.day, usd: Math.max(usd, old.usd), ...(partial ? { partial: true } : {}) };
        return { list: next, changed: true };
    }
    return { list: [...list, { sessionId, day, usd, ...(isPartial ? { partial: true } : {}) }].slice(-limit), changed: true };
}
const sum = (entries) => entries.reduce((total, entry) => total + entry.usd, 0);
export const money = (usd) => `$${usd.toFixed(2)}`;
const plural = (count) => `${count} session${count === 1 ? '' : 's'}`;
const round = (usd) => Math.round(usd * 10000) / 10000;
/** Whether any figure is a lower bound: a stored session or the live one used a model without a known price. */
const isPartialView = (entries, view) => view.isPartial === true || entries.some((entry) => entry.partial);
const atLeast = (isPartial) => (isPartial ? 'at least ' : '');
/** Spend per local day for the last `days` days ending today, empty days included, oldest first. */
export function perDay(entries, days, now) {
    const totals = new Map();
    for (const entry of entries)
        totals.set(entry.day, (totals.get(entry.day) ?? 0) + entry.usd);
    const result = [];
    for (let back = days - 1; back >= 0; back--) {
        const day = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
        result.push({ day, usd: round(totals.get(day) ?? 0) });
    }
    return result;
}
/** How much of the monthly budget the current month used, or undefined without a budget. */
export function budgetStatus(entries, budget, now) {
    if (!budget || !(budget > 0))
        return undefined;
    const month = dayKey(now).slice(0, 7);
    const used = round(sum(entries.filter((entry) => entry.day.startsWith(month))));
    return { budget, used, percent: Math.round((used / budget) * 100), over: used > budget };
}
/** One line for the history: total, sessions and today. */
export function spendLine(entries, now) {
    const today = dayKey(now);
    return `Spend: ${money(sum(entries))} in ${plural(entries.length)} · today ${money(sum(entries.filter((entry) => entry.day === today)))}`;
}
/** A warning for the startup toast when the month went over the budget. */
export function budgetWarning(status) {
    return status?.over
        ? `Spend this month is ${money(status.used)}, over your ${money(status.budget)} budget (${status.percent}%).`
        : undefined;
}
/** Markdown for `/cognita cost`. */
export function formatCost(entries, view) {
    if (entries.length === 0) {
        return view.unavailable ? COST_UNAVAILABLE : 'No cost recorded for this project yet.';
    }
    const days = perDay(entries, DAYS_SHOWN, view.now);
    const isPartial = isPartialView(entries, view);
    const lines = [
        '## Cost',
        '',
        `Total: ${atLeast(isPartial)}${money(sum(entries))} in ${plural(entries.length)} (this project)`,
        '',
        `Average per session: ${money(sum(entries) / entries.length)}`,
    ];
    if (view.current !== undefined)
        lines.push('', `This session so far: ${atLeast(view.isPartial)}${money(view.current)}`);
    if (isPartial)
        lines.push('', '_A model without a known price was used, so these figures are lower bounds._');
    const status = budgetStatus(entries, view.budget, view.now);
    if (status) {
        lines.push('', `Monthly budget: ${money(status.used)} of ${money(status.budget)} (${status.percent}%)${status.over ? ' - over budget' : ''}`);
    }
    lines.push('', `Last ${DAYS_SHOWN} days`, '', '`' + sparkline(days.map((day) => day.usd)) + '`', '', '```');
    for (const day of days.slice().reverse())
        lines.push(`${day.day}  ${money(day.usd).padStart(9)}`);
    lines.push('```', '', `Last ${Math.min(SESSIONS_SHOWN, entries.length)} session${entries.length === 1 ? "" : "s"}`, '', '| Day | Session | Cost |', '| --- | --- | ---: |');
    for (const entry of entries.slice(-SESSIONS_SHOWN).reverse()) {
        const mark = entry.sessionId === view.sessionId ? ' (this session)' : '';
        lines.push(`| ${entry.day} | ${entry.sessionId.slice(0, 8)}${mark} | ${money(entry.usd)}${entry.partial ? '+' : ''} |`);
    }
    return lines.join('\n');
}
/** The same data as JSON, for scripts. */
export function costJson(entries, view) {
    return JSON.stringify({
        totalUsd: round(sum(entries)),
        sessions: entries.length,
        averageUsd: entries.length ? round(sum(entries) / entries.length) : 0,
        currentSessionUsd: view.current ?? null,
        isPartial: isPartialView(entries, view),
        budget: budgetStatus(entries, view.budget, view.now) ?? null,
        days: perDay(entries, DAYS_SHOWN, view.now),
        recentSessions: entries.slice(-SESSIONS_SHOWN).reverse().map((entry) => ({ sessionId: entry.sessionId, day: entry.day, usd: round(entry.usd) })),
    }, null, 2);
}
/** Cost per session id, for the history column. */
export function costBySession(entries) {
    return Object.fromEntries(entries.map((entry) => [entry.sessionId, entry.usd]));
}
