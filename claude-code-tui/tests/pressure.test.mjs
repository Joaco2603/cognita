// Unit tests for the context pressure model, run against the built hooks.
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_PRESSURE,
  applyPlanCall,
  attentionOf,
  compactFocus,
  engramSaveTool,
  formatPressure,
  formatPressureJson,
  goalOf,
  isPlanTool,
  levelOf,
  parsePressureSettings,
  planFromMessages,
  pressureAlert,
  pressureBadge,
  pressureOf,
  promptsOf,
  recommend,
  wordCount,
} from '../hooks/pressure.js'

const todo = (content, status = 'pending') => ({ content, status, activeForm: content })
const items = (count, status = 'pending') =>
  Array.from({ length: count }, (_, index) => ({ id: String(index + 1), text: `Item ${index + 1}`, detail: '', status }))
const words = (count) => Array.from({ length: count }, () => 'word').join(' ')

function input(overrides = {}) {
  return { windowPercent: 0, plan: [], prompts: [], ...overrides }
}

test('wordCount counts words and ignores extra whitespace', () => {
  assert.equal(wordCount(''), 0)
  assert.equal(wordCount('  one  two\nthree\t'), 3)
})

test('TodoWrite replaces the plan; a subagent’s own todo list is ignored', () => {
  let plan = applyPlanCall([], { tool: 'TodoWrite', input: { todos: [todo('Write tests', 'in_progress'), todo('Ship it')] } })
  assert.deepEqual(plan.map((item) => [item.text, item.status]), [['Write tests', 'in_progress'], ['Ship it', 'pending']])

  plan = applyPlanCall(plan, { tool: 'TodoWrite', input: { todos: [todo('Only one')] }, agentId: 'sub-1' })
  assert.equal(plan.length, 2)
})

test('TaskCreate adds tasks by the id in the result, TaskUpdate changes or deletes them', () => {
  let plan = applyPlanCall([], { tool: 'TaskCreate', input: { subject: 'Map the API', description: 'Read the types' }, resultText: 'Task #7 created successfully: Map the API' })
  plan = applyPlanCall(plan, { tool: 'TaskCreate', input: { subject: 'Write the model', description: '' } })
  assert.deepEqual(plan.map((item) => item.id), ['7', '8'])

  plan = applyPlanCall(plan, { tool: 'TaskUpdate', input: { taskId: '7', status: 'completed' } })
  plan = applyPlanCall(plan, { tool: 'TaskUpdate', input: { taskId: '8', subject: 'Write the pressure model' } })
  assert.deepEqual(plan.map((item) => [item.text, item.status]), [['Map the API', 'completed'], ['Write the pressure model', 'pending']])

  plan = applyPlanCall(plan, { tool: 'TaskUpdate', input: { taskId: '8', status: 'deleted' } })
  plan = applyPlanCall(plan, { tool: 'TaskUpdate', input: { taskId: '99', status: 'completed' } })
  assert.deepEqual(plan.map((item) => item.id), ['7'])
})

test('other tools leave the plan as it is', () => {
  const plan = items(2)
  assert.equal(applyPlanCall(plan, { tool: 'Bash', input: { command: 'ls' } }), plan)
})

test('planFromMessages folds every plan call in the transcript', () => {
  const messages = [
    { role: 'assistant', text: '', toolUses: [{ tool: 'TodoWrite', input: { todos: [todo('A'), todo('B')] } }] },
    { role: 'assistant', text: '', toolUses: [{ tool: 'TodoWrite', input: { todos: [todo('A', 'completed'), todo('B', 'in_progress')] } }] },
  ]
  const { plan, hasPlanCalls } = planFromMessages(messages)
  assert.equal(hasPlanCalls, true)
  assert.deepEqual(plan.map((item) => item.status), ['completed', 'in_progress'])
  assert.equal(planFromMessages([{ role: 'user', text: 'hi', toolUses: [] }]).hasPlanCalls, false)
})

test('promptsOf keeps what the person typed and drops reminders, commands and compaction summaries', () => {
  const prompts = promptsOf([
    { role: 'user', text: 'This session is being continued from a previous conversation that ran out of context.', toolUses: [] },
    { role: 'user', text: 'Build the pressure view <system-reminder>be brief</system-reminder>', toolUses: [] },
    { role: 'assistant', text: 'On it', toolUses: [] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ text: 'ok' }] },
    { role: 'user', text: '<command-name>/cognita</command-name><command-args>pressure</command-args>', toolUses: [] },
    { role: 'user', text: 'and add tests', toolUses: [] },
  ])
  assert.deepEqual(prompts, ['Build the pressure view', 'and add tests'])
})

test('promptsOf keeps tags the person typed and drops only the engine markup', () => {
  const prompts = promptsOf([
    { role: 'user', text: 'Usa <Button>texto</Button> en el form <system-reminder>be brief</system-reminder>', toolUses: [] },
  ])
  assert.deepEqual(prompts, ['Usa <Button>texto</Button> en el form'])
})

test('goalOf picks the latest prompt with a few words, shortened', () => {
  assert.equal(goalOf(['Build a context pressure viewer for the plugin', 'yes do it']), 'Build a context pressure viewer for the plugin')
  assert.equal(goalOf([]), '')
  assert.ok(goalOf([words(100)]).length <= 160)
})

test('attention adds capped points for plan items, plan words, prompt words and turns', () => {
  const empty = attentionOf(input())
  assert.equal(empty.total, 0)

  const plan = [...items(3), ...items(2, 'completed')]
  const some = attentionOf(input({ plan, prompts: ['one two three four', words(36)] }))
  assert.equal(some.openItems, 3)
  assert.equal(some.parts.planItems, 12)
  assert.equal(some.recentWords, 40)
  assert.equal(some.parts.promptWords, 1)
  assert.equal(some.parts.turns, 0)

  const heavy = attentionOf(input({
    plan: items(20).map((item) => ({ ...item, detail: words(40) })),
    prompts: Array.from({ length: 40 }, () => words(400)),
  }))
  assert.deepEqual(heavy.parts, { planItems: 40, planWords: 20, promptWords: 20, turns: 20 })
  assert.equal(heavy.total, 100)
})

test('only the last three prompts count as recent words; turns count past the fifth prompt', () => {
  const result = attentionOf(input({ prompts: [words(500), words(10), words(10), words(10), 'a', 'b', 'c'] }))
  assert.equal(result.recentWords, 3)
  assert.equal(result.promptCount, 7)
  assert.equal(result.parts.turns, 2)
})

test('pressure is the window plus half the attention, scaled by the free share', () => {
  assert.equal(pressureOf(input(), DEFAULT_PRESSURE).percent, 0)
  assert.equal(pressureOf(input({ windowPercent: 60 }), DEFAULT_PRESSURE).percent, 60)
  // window 40, attention 100: 40 + 0.5 × 100 × 0.6 = 70
  const full = input({
    windowPercent: 40,
    plan: items(20).map((item) => ({ ...item, detail: words(40) })),
    prompts: Array.from({ length: 40 }, () => words(400)),
  })
  assert.equal(pressureOf(full, DEFAULT_PRESSURE).percent, 70)
  assert.equal(pressureOf(input({ windowPercent: 100, plan: items(10) }), DEFAULT_PRESSURE).percent, 100)
  assert.equal(pressureOf(input({ windowPercent: 140 }), DEFAULT_PRESSURE).percent, 100)
})

test('levels: ok below watch, watch below act, act from there', () => {
  assert.equal(levelOf(49, DEFAULT_PRESSURE), 'ok')
  assert.equal(levelOf(50, DEFAULT_PRESSURE), 'watch')
  assert.equal(levelOf(69, DEFAULT_PRESSURE), 'watch')
  assert.equal(levelOf(70, DEFAULT_PRESSURE), 'act')
  assert.equal(levelOf(30, { ...DEFAULT_PRESSURE, watch: 20, act: 30 }), 'act')
})

test('thresholds come from settings and fall back when they make no sense', () => {
  assert.deepEqual(parsePressureSettings({}), DEFAULT_PRESSURE)
  assert.deepEqual(parsePressureSettings({ watch: '40', act: '60%', alert: '0' }), { watch: 40, act: 60, isAlertEnabled: false })
  assert.deepEqual(parsePressureSettings({ watch: '80', act: '60' }), DEFAULT_PRESSURE)
  assert.deepEqual(parsePressureSettings({ watch: 'lots', act: '150' }), DEFAULT_PRESSURE)
})

test('no recommendation while pressure is ok', () => {
  const data = input({ windowPercent: 20, plan: items(8) })
  assert.deepEqual(recommend(pressureOf(data, DEFAULT_PRESSURE), data), [])
})

test('a full window recommends compacting with focus instructions built from the goal and plan', () => {
  const data = input({
    windowPercent: 75,
    prompts: ['Build a context pressure viewer for the plugin'],
    plan: [{ id: '1', text: 'Write the model', detail: '', status: 'in_progress' }, { id: '2', text: 'Wire the view', detail: '', status: 'pending' }],
  })
  const recs = recommend(pressureOf(data, DEFAULT_PRESSURE), data)
  assert.deepEqual(recs.map((rec) => rec.kind), ['compact'])
  assert.equal(recs[0].command, '/cognita compact')
  assert.match(recs[0].text, /^Keep: the goal "Build a context pressure viewer for the plugin"/)
  assert.match(recs[0].text, /in progress: Write the model/)
  assert.match(recs[0].text, /open plan: Wire the view/)
  assert.match(recs[0].text, /Drop: /)
})

test('a big plan on a light window recommends subagents first, then compacting only if needed', () => {
  // attention 40 + 13.2 + 15 + 11 = 79.2; pressure 25 + 0.5 × 79.2 × 0.75 ≈ 55 (watch)
  const data = input({
    windowPercent: 25,
    plan: items(12).map((item) => ({ ...item, detail: words(20) })),
    prompts: Array.from({ length: 16 }, () => words(200)),
  })
  const pressure = pressureOf(data, DEFAULT_PRESSURE)
  assert.notEqual(pressure.level, 'ok')
  const recs = recommend(pressure, data)
  assert.equal(recs[0].kind, 'split')
  assert.equal(recs[0].command, '/cognita split')
  assert.match(recs[0].text, /1\) Item 1; 2\) Item 2/)
  assert.ok(recs.some((rec) => rec.kind === 'compact'), 'many prompts still call for a compaction')
})

test('a connected Engram server adds a save step before compacting', () => {
  const data = input({ windowPercent: 80, plan: items(2), engramTool: 'mcp__plugin_engram_engram__mem_save' })
  const recs = recommend(pressureOf(data, DEFAULT_PRESSURE), data)
  assert.deepEqual(recs.map((rec) => rec.kind), ['engram', 'compact'])
  assert.equal(recs[0].command, '/cognita save')
  assert.match(recs[0].text, /mcp__plugin_engram_engram__mem_save/)
  assert.match(recs[0].text, /open plan \(2 items\)/)
})

test('engramSaveTool finds the save tool of any Engram server', () => {
  assert.equal(engramSaveTool(['Bash', 'mcp__engram__mem_search', 'mcp__engram__mem_save']), 'mcp__engram__mem_save')
  assert.equal(engramSaveTool(['mcp__plugin_engram_engram__mem_save']), 'mcp__plugin_engram_engram__mem_save')
  assert.equal(engramSaveTool(['Bash', 'mcp__github__create_issue']), undefined)
})

test('compactFocus stays short and works with no goal or plan', () => {
  assert.equal(compactFocus(input()), 'Keep: decisions made and why, and the files being changed. Drop: finished exploration, long tool output, errors already fixed.')
  const long = compactFocus(input({ prompts: [words(300)], plan: items(30).map((item) => ({ ...item, text: words(40) })) }))
  assert.ok(long.length <= 700, `focus is ${long.length} chars`)
  assert.match(long, /\(\+\d+ more\)/)
})

test('the alert fires only when the level rises, and names the one step to take', () => {
  const data = input({ windowPercent: 75, plan: items(3) })
  const pressure = pressureOf(data, DEFAULT_PRESSURE)
  const recs = recommend(pressure, data)
  const alert = pressureAlert('ok', pressure, recs)
  assert.match(alert, /^Context pressure \d+% \(act\)/)
  assert.match(alert, /window 75%/)
  assert.match(alert, /\/cognita compact/)
  assert.equal(pressureAlert('act', pressure, recs), undefined)
  const calm = pressureOf(input({ windowPercent: 10 }), DEFAULT_PRESSURE)
  assert.equal(pressureAlert('watch', calm, []), undefined)
})

test('the status badge shows only when pressure is not ok', () => {
  assert.equal(pressureBadge(undefined), '')
  assert.equal(pressureBadge(pressureOf(input({ windowPercent: 10 }), DEFAULT_PRESSURE)), '')
  assert.equal(pressureBadge(pressureOf(input({ windowPercent: 72 }), DEFAULT_PRESSURE)), 'pressure 72% act')
})

test('the report shows the level, the formula parts and each step with its command', () => {
  const data = input({ windowPercent: 75, windowTokens: 150000, windowMax: 200000, plan: items(6), prompts: ['Build a context pressure viewer for the plugin'], engramTool: 'mcp__engram__mem_save' })
  const pressure = pressureOf(data, DEFAULT_PRESSURE)
  const text = formatPressure(pressure, recommend(pressure, data), DEFAULT_PRESSURE)
  assert.match(text, /^## Context pressure: \d+% · act/)
  assert.match(text, /window 75% \(150,000 of 200,000 tokens\)/)
  assert.match(text, /\| Open plan items \| 6 \| 24 \/ 40 \|/)
  assert.match(text, /`\/cognita save`/)
  assert.match(text, /\/compact Keep: the goal/)
  assert.match(text, /`\/cognita split`/)
  assert.match(text, /estimate/)

  const calm = pressureOf(input({ windowPercent: 10 }), DEFAULT_PRESSURE)
  assert.match(formatPressure(calm, [], DEFAULT_PRESSURE), /Nothing to do yet/)
})

test('the JSON report carries the numbers and recommendations', () => {
  const data = input({ windowPercent: 75, plan: items(2) })
  const pressure = pressureOf(data, DEFAULT_PRESSURE)
  const json = JSON.parse(formatPressureJson(pressure, recommend(pressure, data), DEFAULT_PRESSURE))
  assert.equal(json.shape, 'cognita-pressure-1')
  assert.equal(json.level, 'act')
  assert.equal(json.window.percent, 75)
  assert.deepEqual(json.thresholds, { watch: 50, act: 70 })
  assert.equal(json.recommendations[0].kind, 'compact')
})

test('the desktop app plan tool sets, advances and checks off items', () => {
  const tool = 'mcp__ccd_turn__update_plan'
  let plan = applyPlanCall([], { tool, input: { items: [{ content: 'Map', status: 'in_progress' }, { content: 'Build', status: 'pending' }, { content: 'Ship', status: 'pending' }], scope: 'first_task' } })
  assert.deepEqual(plan.map((item) => item.status), ['in_progress', 'pending', 'pending'])

  plan = applyPlanCall(plan, { tool, input: { advance: true } })
  assert.deepEqual(plan.map((item) => item.status), ['completed', 'in_progress', 'pending'])

  plan = applyPlanCall(plan, { tool, input: { done: [2], start: 3 } })
  assert.deepEqual(plan.map((item) => item.status), ['completed', 'completed', 'in_progress'])
  assert.equal(isPlanTool(tool), true)
})
