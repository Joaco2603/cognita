// Real session cost in USD, kept per project. Pure logic: the store IO lives in register.ts.
import { sparkline } from './loadout.js'

/** What one session has cost, on the local day it was last seen. */
export type CostEntry = {
  sessionId: string
  /** Local day, YYYY-MM-DD. */
  day: string
  usd: number
}

export type BudgetStatus = { budget: number; used: number; percent: number; over: boolean }

/** The most sessions kept per project. */
export const COST_LIMIT = 200
export const DAYS_SHOWN = 14
export const SESSIONS_SHOWN = 20

export const COST_UNAVAILABLE = 'Cost not reported by this Claude Code version.'

const isEntry = (value: unknown): value is CostEntry => {
  const entry = value as Partial<CostEntry> | null
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.sessionId === 'string' &&
    typeof entry.day === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.day) &&
    typeof entry.usd === 'number' &&
    Number.isFinite(entry.usd) &&
    entry.usd >= 0
  )
}

/** The stored list, or an empty one when it is missing or malformed. */
export function costsOf(stored: unknown): CostEntry[] {
  return Array.isArray(stored) ? stored.filter(isEntry) : []
}

/** The local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Remembers this session's cost, keeping the highest value seen (cost only
 * grows) and the most recent COST_LIMIT sessions. `changed` is false when
 * nothing needs saving.
 */
export function recordCost(
  stored: unknown,
  sessionId: string,
  usd: number,
  day: string,
  limit = COST_LIMIT,
): { list: CostEntry[]; changed: boolean } {
  const list = costsOf(stored)
  if (!sessionId || !Number.isFinite(usd) || usd < 0) return { list, changed: false }
  const index = list.findIndex((entry) => entry.sessionId === sessionId)
  if (index >= 0) {
    if (usd <= list[index].usd) return { list, changed: false }
    const next = list.slice()
    next[index] = { sessionId, day: list[index].day, usd }
    return { list: next, changed: true }
  }
  return { list: [...list, { sessionId, day, usd }].slice(-limit), changed: true }
}

const sum = (entries: CostEntry[]) => entries.reduce((total, entry) => total + entry.usd, 0)
export const money = (usd: number) => `$${usd.toFixed(2)}`
const plural = (count: number) => `${count} session${count === 1 ? '' : 's'}`
const round = (usd: number) => Math.round(usd * 10000) / 10000

/** Spend per local day for the last `days` days ending today, empty days included, oldest first. */
export function perDay(entries: CostEntry[], days: number, now: Date): { day: string; usd: number }[] {
  const totals = new Map<string, number>()
  for (const entry of entries) totals.set(entry.day, (totals.get(entry.day) ?? 0) + entry.usd)
  const result: { day: string; usd: number }[] = []
  for (let back = days - 1; back >= 0; back--) {
    const day = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back))
    result.push({ day, usd: round(totals.get(day) ?? 0) })
  }
  return result
}

/** How much of the monthly budget the current month used, or undefined without a budget. */
export function budgetStatus(entries: CostEntry[], budget: number | undefined, now: Date): BudgetStatus | undefined {
  if (!budget || !(budget > 0)) return undefined
  const month = dayKey(now).slice(0, 7)
  const used = round(sum(entries.filter((entry) => entry.day.startsWith(month))))
  return { budget, used, percent: Math.round((used / budget) * 100), over: used > budget }
}

/** One line for the history: total, sessions and today. */
export function spendLine(entries: CostEntry[], now: Date): string {
  const today = dayKey(now)
  return `Spend: ${money(sum(entries))} in ${plural(entries.length)} · today ${money(sum(entries.filter((entry) => entry.day === today)))}`
}

/** A warning for the startup toast when the month went over the budget. */
export function budgetWarning(status: BudgetStatus | undefined): string | undefined {
  return status?.over
    ? `Spend this month is ${money(status.used)}, over your ${money(status.budget)} budget (${status.percent}%).`
    : undefined
}

export type CostView = {
  now: Date
  sessionId?: string
  /** What this session has cost so far, when Claude Code reports it. */
  current?: number
  /** Monthly budget in USD. */
  budget?: number
  /** True when Claude Code did not report a cost at all. */
  unavailable?: boolean
}

/** Markdown for `/cognita cost`. */
export function formatCost(entries: CostEntry[], view: CostView): string {
  if (entries.length === 0) {
    return view.unavailable ? COST_UNAVAILABLE : 'No cost recorded for this project yet.'
  }
  const days = perDay(entries, DAYS_SHOWN, view.now)
  const lines = [
    '## Cost',
    '',
    `Total: ${money(sum(entries))} in ${plural(entries.length)} (this project)`,
    '',
    `Average per session: ${money(sum(entries) / entries.length)}`,
  ]
  if (view.current !== undefined) lines.push('', `This session so far: ${money(view.current)}`)
  const status = budgetStatus(entries, view.budget, view.now)
  if (status) {
    lines.push('', `Monthly budget: ${money(status.used)} of ${money(status.budget)} (${status.percent}%)${status.over ? ' - over budget' : ''}`)
  }
  lines.push('', `Last ${DAYS_SHOWN} days`, '', '`' + sparkline(days.map((day) => day.usd)) + '`', '', '```')
  for (const day of days.slice().reverse()) lines.push(`${day.day}  ${money(day.usd).padStart(9)}`)
  lines.push('```', '', `Last ${Math.min(SESSIONS_SHOWN, entries.length)} session${entries.length === 1 ? "" : "s"}`, '', '| Day | Session | Cost |', '| --- | --- | ---: |')
  for (const entry of entries.slice(-SESSIONS_SHOWN).reverse()) {
    const mark = entry.sessionId === view.sessionId ? ' (this session)' : ''
    lines.push(`| ${entry.day} | ${entry.sessionId.slice(0, 8)}${mark} | ${money(entry.usd)} |`)
  }
  return lines.join('\n')
}

/** The same data as JSON, for scripts. */
export function costJson(entries: CostEntry[], view: CostView): string {
  return JSON.stringify(
    {
      totalUsd: round(sum(entries)),
      sessions: entries.length,
      averageUsd: entries.length ? round(sum(entries) / entries.length) : 0,
      currentSessionUsd: view.current ?? null,
      budget: budgetStatus(entries, view.budget, view.now) ?? null,
      days: perDay(entries, DAYS_SHOWN, view.now),
      recentSessions: entries.slice(-SESSIONS_SHOWN).reverse().map((entry) => ({ sessionId: entry.sessionId, day: entry.day, usd: round(entry.usd) })),
    },
    null,
    2,
  )
}

/** Cost per session id, for the history column. */
export function costBySession(entries: CostEntry[]): Record<string, number> {
  return Object.fromEntries(entries.map((entry) => [entry.sessionId, entry.usd]))
}
