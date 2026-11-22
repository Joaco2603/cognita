// Unit tests for the pure cost tracking, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  COST_LIMIT,
  budgetStatus,
  costsOf,
  dayKey,
  formatCost,
  costJson,
  perDay,
  recordCost,
  spendLine,
} from '../hooks/cost.js'
import { formatHistory } from '../hooks/loadout.js'

const NOW = new Date(2026, 10, 22, 15, 0, 0) // local 2026-11-22

test('recordCost keeps the max seen for a session', () => {
  let r = recordCost(undefined, 's1', 0.5, '2026-11-22')
  assert.equal(r.changed, true)
  r = recordCost(r.list, 's1', 0.3, '2026-11-22')
  assert.equal(r.changed, false)
  assert.equal(r.list[0].usd, 0.5)
  r = recordCost(r.list, 's1', 0.9, '2026-11-22')
  assert.equal(r.list.length, 1)
  assert.equal(r.list[0].usd, 0.9)
})

test('recordCost ignores invalid amounts', () => {
  assert.equal(recordCost(undefined, 's1', Number.NaN, '2026-11-22').changed, false)
  assert.equal(recordCost(undefined, 's1', -1, '2026-11-22').changed, false)
})

test('recordCost bounds the stored list, dropping the oldest', () => {
  let list
  for (let i = 0; i < COST_LIMIT + 10; i++) list = recordCost(list, 's' + i, 1, '2026-11-22').list
  assert.equal(list.length, COST_LIMIT)
  assert.equal(list[0].sessionId, 's10')
})

test('costsOf returns empty for malformed stored values', () => {
  assert.deepEqual(costsOf(undefined), [])
  assert.deepEqual(costsOf('x'), [])
  assert.deepEqual(costsOf({}), [])
  assert.equal(costsOf([{ sessionId: 1 }, null, { sessionId: 'a', day: '2026-11-22', usd: 2 }]).length, 1)
})

test('dayKey uses the local day', () => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

test('perDay aggregates across midnight and fills empty days', () => {
  const list = [
    { sessionId: 'a', day: '2026-11-20', usd: 1 },
    { sessionId: 'b', day: '2026-11-21', usd: 2 },
    { sessionId: 'c', day: '2026-11-21', usd: 0.5 },
    { sessionId: 'd', day: '2026-11-22', usd: 3 },
  ]
  const days = perDay(list, 4, NOW)
  assert.deepEqual(days.map((d) => d.day), ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
  assert.deepEqual(days.map((d) => d.usd), [0, 1, 2.5, 3])
})

test('budgetStatus reports the share of the current month', () => {
  const list = [
    { sessionId: 'a', day: '2026-10-30', usd: 100 },
    { sessionId: 'b', day: '2026-11-02', usd: 10 },
    { sessionId: 'c', day: '2026-11-22', usd: 15 },
  ]
  assert.deepEqual(budgetStatus(list, 50, NOW), { budget: 50, used: 25, percent: 50, over: false })
  assert.equal(budgetStatus(list, 20, NOW).over, true)
  assert.equal(budgetStatus(list, undefined, NOW), undefined)
})

test('spendLine totals and today', () => {
  const list = [
    { sessionId: 'a', day: '2026-11-21', usd: 1 },
    { sessionId: 'b', day: '2026-11-22', usd: 0.25 },
  ]
  assert.equal(spendLine(list, NOW), 'Spend: $1.25 in 2 sessions · today $0.25')
  assert.equal(spendLine([{ sessionId: 'a', day: '2026-11-22', usd: 1 }], NOW), 'Spend: $1.00 in 1 session · today $1.00')
})

test('formatCost renders total, days, sessions, average and this session', () => {
  const list = [
    { sessionId: 'a', day: '2026-11-21', usd: 1 },
    { sessionId: 'b', day: '2026-11-22', usd: 3 },
  ]
  const text = formatCost(list, { now: NOW, sessionId: 'b', current: 3, budget: 40 })
  assert.match(text, /Total: \$4\.00 in 2 sessions/)
  assert.match(text, /Average per session: \$2\.00/)
  assert.match(text, /This session so far: \$3\.00/)
  assert.match(text, /2026-11-22 +\$3\.00/)
  assert.match(text, /Monthly budget: \$4\.00 of \$40\.00 \(10%\)/)
  assert.match(text, /[▁-█]{14}/)
})

test('formatCost without data says so', () => {
  assert.match(formatCost([], { now: NOW }), /No cost recorded/)
  assert.match(formatCost([], { now: NOW, unavailable: true }), /Cost not reported by this Claude Code version/)
})

test('costJson has a stable shape', () => {
  const list = [{ sessionId: 'a', day: '2026-11-22', usd: 2 }]
  const json = JSON.parse(costJson(list, { now: NOW, current: 2, budget: 10 }))
  assert.equal(json.totalUsd, 2)
  assert.equal(json.sessions, 1)
  assert.equal(json.averageUsd, 2)
  assert.equal(json.currentSessionUsd, 2)
  assert.equal(json.days.length, 14)
  assert.deepEqual(json.recentSessions[0], { sessionId: 'a', day: '2026-11-22', usd: 2 })
  assert.deepEqual(json.budget, { budget: 10, used: 2, percent: 20, over: false })
})

test('formatHistory is unchanged without cost data and adds a $ column with it', () => {
  const trend = [{ sessionId: 's1', at: '2026-11-21T10:00:00.000Z', model: 'm', baseTokens: 1000 }]
  const plain = formatHistory(trend, 's1')
  assert.equal(plain, formatHistory(trend, 's1', undefined, undefined))
  assert.doesNotMatch(plain, /\$/)
  const withCost = formatHistory(trend, 's1', undefined, { s1: 1.5 })
  assert.match(withCost, /\| \$ \|/)
  assert.match(withCost, /\$1\.50/)
})

test('recordCost marks a session partial once a model had no known price, and keeps it', () => {
  const first = recordCost([], 's1', 0.5, '2026-11-22', undefined, true).list
  assert.deepEqual(first, [{ sessionId: 's1', day: '2026-11-22', usd: 0.5, partial: true }])
  const second = recordCost(first, 's1', 0.9, '2026-11-22').list
  assert.deepEqual(second, [{ sessionId: 's1', day: '2026-11-22', usd: 0.9, partial: true }])
  assert.equal(recordCost([{ sessionId: 's2', day: '2026-11-22', usd: 1 }], 's2', 1, '2026-11-22', undefined, true).changed, true)
})

test('a partial session makes the totals lower bounds in Markdown and JSON', () => {
  const entries = [{ sessionId: 'aaaaaaaa1', day: '2026-11-22', usd: 0.8, partial: true }, { sessionId: 'bbbbbbbb2', day: '2026-11-22', usd: 1 }]
  const view = { now: new Date(2026, 10, 22, 12) }
  const text = formatCost(entries, view)
  assert.match(text, /Total: at least \$1\.80 in 2 sessions/)
  assert.match(text, /\| aaaaaaaa \| \$0\.80\+ \|/)
  assert.match(text, /lower bounds/)
  assert.equal(JSON.parse(costJson(entries, view)).isPartial, true)
  assert.equal(JSON.parse(costJson([entries[1]], view)).isPartial, false)
  assert.doesNotMatch(formatCost([entries[1]], view), /at least/)
})
