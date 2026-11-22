// Tagged items: what the person marks in a prompt as important, decided, open
// or binding. Cognita estimates the attention each gets, asks every compaction
// to keep them by id, and checks afterwards which ones survived.
import { estimateTokens } from './loadout.js';
export const TAG_KINDS = ['important', 'decision', 'open', 'constraint'];
/** How much each kind matters when attention is shared out. Estimates, not measurements. */
export const TAG_WEIGHTS = { important: 1, constraint: 1, decision: 0.75, open: 0.5 };
const ID_PREFIX = { important: 'i', decision: 'd', open: 'o', constraint: 'c' };
const TAG = /<(important|decision|open|constraint)(?:\s+id\s*=\s*"([^"]*)")?\s*>([\s\S]*?)<\/\1\s*>/gi;
const flat = (text) => text.replace(/\s+/g, ' ').trim();
const countWords = (text) => text.split(/\s+/).filter(Boolean).length;
/**
 * Every tagged item in the prompts, oldest first. An explicit `id` stays; the
 * rest are numbered by kind (`d1`, `d2`, `c1`) skipping ids already taken.
 * `previous` holds the items seen before, which a compaction may have dropped
 * from the prompts: an item seen before keeps its id, and a new one never
 * takes the id of an old one.
 */
export function extractTagged(prompts, previous = []) {
    const found = [];
    for (const prompt of prompts) {
        for (const match of prompt.matchAll(TAG)) {
            const text = flat(match[3]);
            if (text)
                found.push({ kind: match[1].toLowerCase(), id: match[2]?.trim() || undefined, text });
        }
    }
    const taken = new Set([...found.map((item) => item.id), ...previous.map((item) => item.id)].filter(Boolean));
    const counters = { important: 0, decision: 0, open: 0, constraint: 0 };
    const used = new Set();
    return found.map((item) => {
        const seen = item.id ? undefined : previous.find((old) => old.kind === item.kind && old.text === item.text && !used.has(old.id));
        let id = item.id ?? seen?.id;
        while (!id || (id !== item.id && id !== seen?.id && taken.has(id))) {
            counters[item.kind] += 1;
            id = `${ID_PREFIX[item.kind]}${counters[item.kind]}`;
        }
        taken.add(id);
        used.add(id);
        return { id, kind: item.kind, text: item.text, words: countWords(item.text) };
    });
}
/** Items seen before stay (a compaction drops the prompts that held them); the newest text wins. */
export function mergeTagged(previous, current) {
    const byId = new Map(previous.map((item) => [item.id, item]));
    for (const item of current)
        byId.set(item.id, item);
    return [...byId.values()];
}
/**
 * How the attention on tagged items is shared out, assuming the model attends
 * to text roughly by its size, scaled by how much each kind matters. A long
 * open item can crowd out a short constraint: that is what this shows.
 */
export function focusOf(items, windowTokens) {
    const sized = items.map((item) => ({ ...item, tokens: estimateTokens(item.text.length), weight: TAG_WEIGHTS[item.kind] }));
    const weighted = sized.reduce((total, item) => total + item.weight * item.tokens, 0);
    const even = items.length > 0 ? 100 / items.length : 0;
    const result = sized.map((item) => {
        const focus = weighted > 0 ? (item.weight * item.tokens * 100) / weighted : 0;
        return {
            ...item,
            windowShare: windowTokens ? (item.tokens * 100) / windowTokens : 0,
            focus,
            isCrowded: items.length >= 2 && (item.kind === 'important' || item.kind === 'constraint') && focus < even / 2,
        };
    });
    return { items: result, crowded: result.filter((item) => item.isCrowded), tokens: sized.reduce((total, item) => total + item.tokens, 0) };
}
/** Starts the block a compaction is asked to honor; finding it means the block is already there. */
export const KEEP_MARKER = 'Tagged items to keep:';
/** What the summarizer is told about the tagged items. */
export function taggedInstructions(items) {
    return [
        `${KEEP_MARKER} keep each one in the summary as its own line, starting with its id in brackets, with its meaning unchanged.`,
        ...items.map((item) => `[${item.id}] ${item.kind}: ${item.text}`),
    ].join('\n');
}
/** Adds the tagged block to compaction instructions, once. */
export function withTaggedInstructions(instructions, items) {
    if (items.length === 0 || instructions?.includes(KEEP_MARKER))
        return instructions;
    return [instructions, taggedInstructions(items)].filter(Boolean).join('\n\n');
}
const KEPT_FROM = 60;
const KEPT_WITHOUT_ID_FROM = 80;
const wordSet = (text) => new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []));
function overlapOf(item, found) {
    const words = wordSet(item);
    if (words.size === 0)
        return 100;
    const there = wordSet(found);
    let shared = 0;
    for (const word of words)
        if (there.has(word))
            shared += 1;
    return Math.round((shared * 100) / words.size);
}
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/**
 * Which tagged items a compaction summary kept. With its id, an item is kept
 * when most of its words are on that line and rewritten otherwise; without
 * it, kept only when nearly all its words are in the summary. Word overlap
 * shows how much the text changed, not whether its meaning did.
 */
export function retentionOf(items, summary) {
    const lines = summary.split('\n');
    const result = items.map((item) => {
        const id = new RegExp(`\\[${escape(item.id)}\\]|\\b${escape(item.id)}\\b`, 'i');
        const line = lines.find((candidate) => id.test(candidate));
        if (line !== undefined) {
            const overlap = overlapOf(item.text, line);
            return { id: item.id, kind: item.kind, text: item.text, status: overlap >= KEPT_FROM ? 'kept' : 'rewritten', overlap };
        }
        const overlap = overlapOf(item.text, summary);
        return { id: item.id, kind: item.kind, text: item.text, status: overlap >= KEPT_WITHOUT_ID_FROM ? 'kept' : 'lost', overlap };
    });
    const count = (status) => result.filter((item) => item.status === status).length;
    return { items: result, kept: count('kept'), rewritten: count('rewritten'), lost: count('lost') };
}
const quote = (text) => `"${text.length > 60 ? `${text.slice(0, 59)}…` : text}"`;
/** The toast after a compaction that lost or rewrote a tagged item, or undefined when it kept them all. */
export function retentionAlert(retention) {
    if (retention.items.length === 0 || retention.kept === retention.items.length)
        return undefined;
    const lost = retention.items.filter((item) => item.status === 'lost');
    const rewritten = retention.items.filter((item) => item.status === 'rewritten');
    return [
        `Compaction kept ${retention.kept} of ${retention.items.length} tagged items.`,
        lost.length > 0 ? `Lost: ${lost.map((item) => `${item.id} (${item.kind}) ${quote(item.text)}`).join(', ')}.` : '',
        rewritten.length > 0 ? `Rewritten: ${rewritten.map((item) => `${item.id} (${item.overlap}% of its words)`).join(', ')}.` : '',
        'Run /cognita pressure for details.',
    ].filter(Boolean).join(' ');
}
const percent = (value) => (value > 0 && value < 0.01 ? '<0.01%' : `${value.toFixed(2)}%`);
/** The report's section on tagged items, or no lines when nothing is tagged. */
export function formatTagged(focus) {
    if (focus.items.length === 0)
        return [];
    const lines = [
        '### Tagged items (estimate)',
        '',
        '| Id | Tag | Words | Share of window | Share of tagged attention |',
        '| --- | --- | --- | --- | --- |',
        ...focus.items.map((item) => `| ${item.id} | ${item.kind} | ${item.words} | ${percent(item.windowShare)} | ${Math.round(item.focus)}% |`),
        '',
        'Tagged attention = importance × size: important and constraint count 1, decision 0.75, open 0.5. Every compaction is asked to keep these items by id.',
    ];
    for (const item of focus.crowded) {
        lines.push('', `⚠ ${item.id} (${item.kind}) gets ${Math.round(item.focus)}% of the attention on tagged items while longer ones take the rest. Restate it in a short line, or shorten the long items.`);
    }
    return lines;
}
/** The report's lines on the last compaction's retention. */
export function formatRetention(retention) {
    if (!retention || retention.items.length === 0)
        return [];
    return [
        `**Retention at the last compaction:** kept ${retention.kept} of ${retention.items.length} tagged items (checked by id and shared words, an estimate).`,
        ...retention.items
            .filter((item) => item.status !== 'kept')
            .map((item) => `- ${item.id} (${item.kind}): ${item.status === 'lost' ? 'lost' : `rewritten, ${item.overlap}% of its words kept`}`),
    ];
}
